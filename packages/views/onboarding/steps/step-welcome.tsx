"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  Download,
  GitBranch,
  Layers3,
  Loader2,
  MessageSquareText,
  UserRound,
  Users,
} from "lucide-react";
import { Button, buttonVariants } from "@silieco/ui/components/ui/button";
import { SiliecoIcon } from "@silieco/ui/components/common/silieco-icon";
import { cn } from "@silieco/ui/lib/utils";
import { DragStrip } from "@silieco/views/platform";
import { useT } from "../../i18n";

/**
 * Step 0 — the one-shot product intro shown on every onboarding
 * entry (which-step-are-you-on is not persisted). Returning users
 * who are already onboarded never reach this screen; they're gated
 * out earlier by `!hasOnboarded`.
 *
 * Layout: two-column editorial hero on lg+, single column below.
 * Left = product promise + CTA. Right = a conceptual operating model
 * that introduces Space, SOP / Workflow, Stage, and Task without
 * pretending to be a screenshot of the product. The model is hidden
 * below lg so the headline and CTA stay focused on narrow viewports.
 *
 * `onSkip`, when provided, renders a secondary ghost CTA that marks
 * onboarding complete server-side and sends the user straight to
 * their existing workspace. OnboardingFlow only passes it when the
 * user has ≥ 1 workspace — without that, skipping lands in limbo.
 *
 * `isWeb` flips two things when true: the subheading acknowledges
 * that web users have an extra runtime step (so "3 minutes" stops
 * being a lie), and a "Download Desktop" secondary CTA surfaces
 * before the user has invested in questionnaire / workspace. Desktop
 * bundles a daemon, so the same prompt would be noise there.
 */
export function StepWelcome({
  onNext,
  onSkip,
  isWeb = false,
}: {
  onNext: () => void | Promise<void>;
  onSkip?: () => void | Promise<void>;
  isWeb?: boolean;
}) {
  const { t } = useT("onboarding");
  // Tracks which button is mid-flight so we can show a per-button
  // spinner and disable both while one is in progress.
  const [pending, setPending] = useState<"next" | "skip" | null>(null);

  const handleNext = async () => {
    if (pending) return;
    setPending("next");
    try {
      await onNext();
    } finally {
      setPending(null);
    }
  };

  const handleSkip = async () => {
    if (pending || !onSkip) return;
    setPending("skip");
    try {
      await onSkip();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="animate-onboarding-enter flex h-full min-h-[640px] flex-col lg:flex-row">
      {/* Left — prose + CTA */}
      <div className="flex flex-col lg:flex-1">
        <DragStrip />
        <div className="flex flex-1 flex-col justify-center px-6 pb-12 sm:px-10 md:px-20 lg:px-20 xl:px-24">
          <div className="flex w-full max-w-[540px] flex-col gap-8">
            <div className="flex items-center gap-2.5">
              <SiliecoIcon className="size-5 text-foreground" noSpin />
              <span className="text-title-lg font-semibold tracking-[-0.02em]">
                {t(($) => $.welcome.wordmark)}
              </span>
            </div>

            <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl">
              {t(($) => $.welcome.headline_line1)}
              <br />
              {t(($) => $.welcome.headline_line2)}{" "}
              <span className="text-brand">
                {t(($) => $.welcome.headline_emphasis)}
              </span>
            </h1>

            <div className="flex flex-col gap-4">
              <p className="text-title leading-relaxed text-foreground/85">
                {t(($) => $.welcome.lede)}
              </p>
              <p className="text-body leading-relaxed text-muted-foreground">
                {isWeb
                  ? t(($) => $.welcome.lede_web)
                  : t(($) => $.welcome.lede_desktop)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isWeb ? (
                <>
                  {/* `<a>` rather than `<Button onClick={window.open}>`
                      so middle-click / cmd-click / "Copy link" all
                      behave and screen readers announce it as a link
                      (it navigates; `Continue on web` is the button
                      that mutates flow state). New tab preserves this
                      onboarding tab in case the desktop install
                      stalls and the user falls back here. */}
                  <a
                    href="/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ size: "lg" })}
                  >
                    <Download className="h-4 w-4" />
                    {t(($) => $.welcome.download_desktop)}
                  </a>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleNext}
                    disabled={pending !== null}
                  >
                    {pending === "next" && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {t(($) => $.welcome.continue_on_web)}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  onClick={handleNext}
                  disabled={pending !== null}
                >
                  {pending === "next" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {t(($) => $.welcome.start_exploring)}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {onSkip && (
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={pending !== null}
                >
                  {pending === "skip" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {t(($) => $.welcome.skip_existing)}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right-side product model. Hidden below lg so onboarding remains
          concise on narrow viewports. */}
      <div className="hidden border-l bg-muted/35 lg:flex lg:flex-1 lg:flex-col lg:overflow-hidden">
        <DragStrip />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-8 xl:px-12">
          <p className="max-w-[520px] text-balance text-center text-body-lg font-medium leading-snug text-foreground/75">
            {t(($) => $.welcome.illustration_caption)}
          </p>
          <OperatingModelIllustration />
        </div>
      </div>
    </div>
  );
}


function OperatingModelIllustration() {
  const { t } = useT("onboarding");

  const stages = [
    t(($) => $.welcome.illustration.stage_intent),
    t(($) => $.welcome.illustration.stage_plan),
    t(($) => $.welcome.illustration.stage_execute),
    t(($) => $.welcome.illustration.stage_review),
  ];

  return (
    <div
      className="w-full max-w-[540px] overflow-hidden rounded-xl border bg-background shadow-sm"
      aria-label={t(($) => $.welcome.illustration.model_aria)}
    >
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
          <Layers3 className="size-4 text-brand" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-caption font-medium text-muted-foreground">
            <span>{t(($) => $.welcome.illustration.space_label)}</span>
            <span className="h-3 w-px bg-border" aria-hidden />
            <span>{t(($) => $.welcome.illustration.shared_context)}</span>
          </div>
          <p className="mt-1 text-title font-semibold tracking-[-0.02em]">
            {t(($) => $.welcome.illustration.space_name)}
          </p>
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
            {t(($) => $.welcome.illustration.space_context)}
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <GitBranch className="size-4 shrink-0 text-brand" aria-hidden />
            <span className="text-body font-semibold">
              {t(($) => $.welcome.illustration.workflow_name)}
            </span>
          </div>
          <span className="shrink-0 text-caption font-medium text-muted-foreground">
            {t(($) => $.welcome.illustration.workflow_label)}
          </span>
        </div>

        <ol className="mt-4 grid grid-cols-4 gap-2">
          {stages.map((stage, index) => {
            const active = index === 2;
            const complete = index < 2;
            return (
              <li
                key={stage}
                className={cn(
                  "relative min-w-0 rounded-lg border px-2.5 py-2.5",
                  active
                    ? "border-brand/50 bg-brand/10"
                    : "bg-muted/25",
                )}
              >
                <div
                  className={cn(
                    "mb-2 flex size-5 items-center justify-center rounded-full border text-micro font-semibold",
                    complete && "border-brand/40 bg-brand text-primary-foreground",
                    active && "border-brand/50 text-brand",
                    !complete && !active && "text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {complete ? <Check className="size-3" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "block text-balance text-caption leading-snug",
                    active
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {stage}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-t bg-muted/20 px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-caption font-semibold text-foreground">
            {t(($) => $.welcome.illustration.current_stage)}
          </span>
          <span className="text-caption text-muted-foreground">
            {t(($) => $.welcome.illustration.stage_progress)}
          </span>
        </div>
        <div className="grid gap-2">
          <TaskAssignment
            icon={UserRound}
            title={t(($) => $.welcome.illustration.human_task)}
            assignee={t(($) => $.welcome.illustration.human_assignee)}
          />
          <TaskAssignment
            icon={Bot}
            title={t(($) => $.welcome.illustration.agent_task)}
            assignee={t(($) => $.welcome.illustration.agent_assignee)}
            agent
          />
        </div>
      </div>

      <div className="grid grid-cols-3 border-t">
        <CollaborationSignal
          icon={Users}
          label={t(($) => $.welcome.illustration.people_collaboration)}
        />
        <CollaborationSignal
          icon={Bot}
          label={t(($) => $.welcome.illustration.agent_collaboration)}
        />
        <CollaborationSignal
          icon={MessageSquareText}
          label={t(($) => $.welcome.illustration.context_continuity)}
        />
      </div>
    </div>
  );
}

function TaskAssignment({
  icon: Icon,
  title,
  assignee,
  agent = false,
}: {
  icon: typeof UserRound;
  title: string;
  assignee: string;
  agent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background px-3.5 py-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
          agent ? "bg-brand/10 text-brand" : "bg-muted/40 text-foreground/70",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-foreground">{title}</p>
        <p className="mt-0.5 truncate text-caption text-muted-foreground">
          {assignee}
        </p>
      </div>
      <span
        className="size-2 shrink-0 rounded-full bg-brand"
        aria-label="in_progress"
      />
    </div>
  );
}

function CollaborationSignal({
  icon: Icon,
  label,
}: {
  icon: typeof Users;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-3.5">
      <Icon className="size-4 text-brand" aria-hidden />
      <span className="text-caption leading-snug text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
