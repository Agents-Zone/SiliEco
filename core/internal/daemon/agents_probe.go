package daemon

import (
	"os"
	"strings"
	"sync"
	"time"
)

// shellResolveTTL bounds how long one login-shell PATH resolution is reused
// across probeAgentCLIs calls.
//
// This is deliberately much longer than agentDiscoveryInterval so the frequent
// discovery round stays a pure exec.LookPath sweep: resolveAgentsViaLoginShell
// forks the user's login shell and runs their rc files, and there is almost
// always at least one uninstalled provider to miss LookPath on, so a short TTL
// would turn discovery into a shell fork every few minutes for the life of the
// daemon.
//
// The practical effect: a CLI on the daemon's own PATH is discovered within
// agentDiscoveryInterval, while one reachable only through the login shell
// (nvm/fnm shims, a ~/.local/bin that only ~/.zshrc adds) takes up to this long
// — still without a restart, which is the part that was previously impossible.
var shellResolveTTL = 30 * time.Minute

var (
	shellResolveMu    sync.Mutex
	shellResolveCache map[string]string
	shellResolveKey   string
	shellResolvedAt   time.Time
)

// shellResolveEnvKey fingerprints the environment that determines what a login
// shell resolves. A change to any of these invalidates the cache immediately,
// independent of the TTL — the cached answer was for a different environment.
func shellResolveEnvKey() string {
	return strings.Join([]string{
		os.Getenv("PATH"),
		os.Getenv("SHELL"),
		os.Getenv("HOME"),
	}, "\x00")
}

// cachedShellResolvedAgents resolves every standard agent command name through
// the user's login shell, reusing the previous result for shellResolveTTL as
// long as the resolution-relevant environment is unchanged.
//
// resolveAgentsViaLoginShell forks the user's login shell, which runs their rc
// files, so this must stay a cache and not a per-probe call: probeAgentCLIs now
// runs periodically on a live daemon, and there is almost always at least one
// uninstalled provider to miss LookPath on.
func cachedShellResolvedAgents() map[string]string {
	shellResolveMu.Lock()
	defer shellResolveMu.Unlock()
	key := shellResolveEnvKey()
	if shellResolveCache != nil && shellResolveKey == key && time.Since(shellResolvedAt) < shellResolveTTL {
		return shellResolveCache
	}
	resolved := resolveAgentsViaLoginShell(defaultAgentCommandNames)
	if resolved == nil {
		// Distinguish "resolved nothing" from "never resolved" so a failing
		// shell doesn't get re-forked on every probe inside the TTL window.
		resolved = map[string]string{}
	}
	shellResolveCache = resolved
	shellResolveKey = key
	shellResolvedAt = time.Now()
	return shellResolveCache
}

// probeAgentCLIs discovers which built-in agent CLIs are installed on this
// machine and returns one AgentEntry per provider that resolved.
//
// This is pure discovery: no version detection and no minimum-version gate
// (detectBuiltinRuntimes owns those, per registration round). The result is
// therefore the machine's *availability* set, which is exactly what
// /health.agents reports and what `silieco daemon probe-runtimes` prints.
//
// It is called once from LoadConfig at startup and again from the periodic
// workspace sync (refreshAgentAvailability), so a CLI the user installs while
// the daemon is already running gets picked up without a restart (SILI-5439).
// Everything it reads is process-external (PATH, SILIECO_*_PATH, SILIECO_*_MODEL),
// so re-running it is the only way to observe such an install.
//
// A var so tests can stub discovery without installing real CLIs.
var probeAgentCLIs = func() map[string]AgentEntry {
	// Probe available agent CLIs. exec.LookPath is the primary path, but on
	// macOS/Linux a GUI-launched daemon (Electron, Launchpad) does not
	// inherit the user's interactive shell PATH — fnm/nvm/volta multishells,
	// the Anthropic native installer prefix, and per-user npm prefixes all
	// live in dirs that only get added to PATH by ~/.zshrc or ~/.bashrc.
	// shellResolvedAgents asks the user's login shell, lazily on first miss,
	// to resolve every standard agent name to its canonical absolute path,
	// so we can find binaries the bare daemon process can't see. See
	// resolveAgentsViaLoginShell for the details and constraints.
	//
	// Laziness matters: the happy path (every agent on the daemon's PATH or
	// pinned to an explicit SILIECO_*_PATH) must not pay the cost of
	// spawning the user's login shell — that touches their rc files and
	// adds startup latency that scales with whatever they put in there. We
	// only fork a shell when a bare command name actually missed LookPath.
	//
	// The resolution is cached process-wide with a TTL (not per call) because
	// this function now also runs periodically on a live daemon: a per-call
	// sync.Once would fork a login shell on every discovery round, since there
	// is almost always at least one uninstalled provider to miss on. The TTL
	// still lets a CLI installed into a login-shell-only PATH dir (nvm, fnm,
	// ~/.local/bin via ~/.zshrc) be discovered without a restart (SILI-5439).
	getShellResolved := cachedShellResolvedAgents
	probe := func(envVar, defaultCmd, modelEnv string) (AgentEntry, bool) {
		cmd := envOrDefault(envVar, defaultCmd)
		if path, err := resolveAgentExecutablePath(cmd); err == nil {
			return AgentEntry{
				Path:    path,
				Command: cmd,
				Model:   strings.TrimSpace(os.Getenv(modelEnv)),
			}, true
		}
		// The shell fallback only rescues bare command names. An operator
		// who pinned SILIECO_*_PATH to an absolute or relative path that
		// doesn't exist should hard-miss, not silently get a different
		// binary.
		if strings.ContainsAny(cmd, "/\\") {
			return AgentEntry{}, false
		}
		if path, ok := getShellResolved()[cmd]; ok {
			return AgentEntry{
				Path:    path,
				Command: cmd,
				Model:   strings.TrimSpace(os.Getenv(modelEnv)),
			}, true
		}
		if defaultCmd == "codex" && cmd == defaultCmd {
			// Codex Desktop bundles its CLI inside the macOS app instead of
			// installing it onto PATH.
			for _, p := range codexDesktopAppBundlePaths() {
				if _, err := os.Stat(p); err == nil {
					return AgentEntry{
						Path:    p,
						Command: cmd,
						Model:   strings.TrimSpace(os.Getenv(modelEnv)),
					}, true
				}
			}
		}
		return AgentEntry{}, false
	}

	agents := map[string]AgentEntry{}
	if e, ok := probe("SILIECO_CLAUDE_PATH", "claude", "SILIECO_CLAUDE_MODEL"); ok {
		agents["claude"] = e
	}
	if e, ok := probe("SILIECO_CODEX_PATH", "codex", "SILIECO_CODEX_MODEL"); ok {
		agents["codex"] = e
	}
	if e, ok := probe("SILIECO_OPENCODE_PATH", "opencode", "SILIECO_OPENCODE_MODEL"); ok {
		agents["opencode"] = e
	}
	if e, ok := probe("SILIECO_DEVECO_PATH", "deveco", "SILIECO_DEVECO_MODEL"); ok {
		agents["deveco"] = e
	}
	if e, ok := probe("SILIECO_OPENCLAW_PATH", "openclaw", "SILIECO_OPENCLAW_MODEL"); ok {
		agents["openclaw"] = e
	}
	if e, ok := probe("SILIECO_HERMES_PATH", "hermes", "SILIECO_HERMES_MODEL"); ok {
		agents["hermes"] = e
	}
	if e, ok := probe("SILIECO_PI_PATH", "pi", "SILIECO_PI_MODEL"); ok {
		agents["pi"] = e
	}
	if e, ok := probe("SILIECO_CURSOR_PATH", "cursor-agent", "SILIECO_CURSOR_MODEL"); ok {
		agents["cursor"] = e
	}
	if e, ok := probe("SILIECO_COPILOT_PATH", "copilot", "SILIECO_COPILOT_MODEL"); ok {
		agents["copilot"] = e
	}
	if e, ok := probe("SILIECO_KIMI_PATH", "kimi", "SILIECO_KIMI_MODEL"); ok {
		agents["kimi"] = e
	}
	if e, ok := probe("SILIECO_KIRO_PATH", "kiro-cli", "SILIECO_KIRO_MODEL"); ok {
		agents["kiro"] = e
	}
	if e, ok := probe("SILIECO_CODEBUDDY_PATH", "codebuddy", "SILIECO_CODEBUDDY_MODEL"); ok {
		agents["codebuddy"] = e
	}
	// agy 1.0.6 added a `--model` flag (SILI-3125), so Antigravity now takes a
	// model env like every other backend. SILIECO_ANTIGRAVITY_MODEL seeds the
	// daemon-wide default; its value is the exact `agy models` display string
	// (e.g. "Claude Opus 4.6 (Thinking)"), not a provider/model slug.
	if e, ok := probe("SILIECO_ANTIGRAVITY_PATH", "agy", "SILIECO_ANTIGRAVITY_MODEL"); ok {
		agents["antigravity"] = e
	}
	qoderPath := envOrDefault("SILIECO_QODER_PATH", "qodercli")
	if path, err := resolveAgentExecutablePath(qoderPath); err == nil {
		agents["qoder"] = AgentEntry{
			Path:    path,
			Command: qoderPath,
			Model:   strings.TrimSpace(os.Getenv("SILIECO_QODER_MODEL")),
		}
	}
	// ByteDance official TRAE CLI (the `traecli` binary from https://docs.trae.cn/cli),
	// driven over ACP via `traecli acp serve --yolo`. SILIECO_TRAECLI_MODEL seeds
	// the daemon-wide default model (a model id from the user's logged-in traecli
	// catalog).
	if e, ok := probe("SILIECO_TRAECLI_PATH", "traecli", "SILIECO_TRAECLI_MODEL"); ok {
		agents["traecli"] = e
	}
	// xAI Grok Build CLI (`grok`), driven over ACP via
	// `grok agent --always-approve stdio`. SILIECO_GROK_MODEL seeds the
	// daemon-wide default (e.g. grok-4.5).
	if e, ok := probe("SILIECO_GROK_PATH", "grok", "SILIECO_GROK_MODEL"); ok {
		agents["grok"] = e
	}
	// Qwen Code (`qwen`) runs headlessly with -p and stream-json. Its native
	// QWEN.md and .qwen/skills task context is prepared by execenv.
	if e, ok := probe("SILIECO_QWEN_PATH", "qwen", "SILIECO_QWEN_MODEL"); ok {
		agents["qwen"] = e
	}
	return agents
}
