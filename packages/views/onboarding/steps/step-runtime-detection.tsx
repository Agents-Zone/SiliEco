"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@silieco/ui/components/ui/button";
import { DragStrip } from "@silieco/views/platform";
import { StepHeader } from "../components/step-header";
import { useT } from "../../i18n";

export type RuntimeDetectionResult =
  | {
      probeResult: "success";
      runtimeCount: number;
      providerSummary: Record<string, number>;
      onlineCount: number;
      offlineCount: number;
    }
  | { probeResult: "error" };

type DetectionPhase = "scanning" | "found" | "empty";

export function StepRuntimeDetection({
  onProbe,
  onNext,
  onBack,
  installInstructions,
}: {
  onProbe?: () => Promise<RuntimeDetectionResult>;
  onNext: (result: RuntimeDetectionResult | null) => void;
  onBack?: () => void;
  installInstructions?: React.ReactNode;
}) {
  const { t } = useT("onboarding");
  const [phase, setPhase] = useState<DetectionPhase>("scanning");
  const [result, setResult] = useState<RuntimeDetectionResult | null>(null);

  const probe = useCallback(async () => {
    setPhase("scanning");
    try {
      if (!onProbe) {
        setResult(null);
        setPhase("empty");
        return;
      }
      const next = await onProbe();
      setResult(next);
      setPhase(
        next.probeResult === "success" && next.runtimeCount > 0
          ? "found"
          : "empty",
      );
    } catch {
      setResult({ probeResult: "error" });
      setPhase("empty");
    }
  }, [onProbe]);

  useEffect(() => {
    void probe();
  }, [probe]);

  const providers =
    result?.probeResult === "success"
      ? Object.entries(result.providerSummary).sort(([a], [b]) =>
          a.localeCompare(b),
        )
      : [];

  return (
    <div className="animate-onboarding-enter grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-h-0 flex-col bg-background">
        <DragStrip />
        <header className="flex shrink-0 items-center gap-4 px-6 py-3 sm:px-10 md:px-14 lg:px-16">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-body text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t(($) => $.common.back)}
            </button>
          ) : (
            <span aria-hidden className="w-0" />
          )}
          <div className="flex-1">
            <StepHeader currentStep="runtime" />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[700px] px-6 py-10 sm:px-10 md:px-14 lg:py-16">
            <div className="text-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {t(($) => $.step_runtime_detection.eyebrow)}
            </div>
            <h1 className="mt-2 text-balance text-display font-semibold leading-[1.05] tracking-[-0.035em] text-foreground">
              {t(($) => $.step_runtime_detection.headline)}
            </h1>
            <p className="mt-4 max-w-[600px] text-body-lg leading-[1.6] text-muted-foreground">
              {t(($) => $.step_runtime_detection.lede)}
            </p>

            <div className="mt-10 rounded-2xl border bg-card p-6 shadow-sm">
              {phase === "scanning" ? (
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {t(($) => $.step_runtime_detection.scanning)}
                    </p>
                    <p className="mt-1 text-body text-muted-foreground">
                      {t(($) => $.step_runtime_detection.scanning_hint)}
                    </p>
                  </div>
                </div>
              ) : phase === "found" ? (
                <div>
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-success/10 p-3 text-success">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t(($) => $.step_runtime_detection.found, {
                          count:
                            result?.probeResult === "success"
                              ? result.runtimeCount
                              : 0,
                        })}
                      </p>
                      <p className="mt-1 text-body text-muted-foreground">
                        {t(($) => $.step_runtime_detection.found_hint)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {providers.map(([provider, count]) => (
                      <span
                        key={provider}
                        className="rounded-full border bg-muted/40 px-3 py-1.5 text-caption font-medium capitalize text-foreground"
                      >
                        {provider}
                        {count > 1 ? ` × ${count}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-muted p-3 text-muted-foreground">
                      <TerminalSquare className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t(($) => $.step_runtime_detection.empty)}
                      </p>
                      <p className="mt-1 text-body text-muted-foreground">
                        {t(($) => $.step_runtime_detection.empty_hint)}
                      </p>
                    </div>
                  </div>
                  {installInstructions && (
                    <div className="mt-5 border-t pt-5">
                      {installInstructions}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void probe()}
                disabled={phase === "scanning"}
              >
                <RefreshCw className="size-4" />
                {t(($) => $.step_runtime_detection.scan_again)}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => onNext(result)}
                disabled={phase === "scanning"}
              >
                {t(($) => $.common.continue)}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>

      <aside className="hidden min-h-0 border-l bg-muted/30 lg:flex lg:flex-col">
        <DragStrip />
        <div className="flex flex-1 flex-col justify-center px-12 py-14">
          <span className="font-mono text-caption text-primary">01 / 03</span>
          <h2 className="mt-4 text-title-lg font-semibold leading-tight text-foreground">
            {t(($) => $.step_runtime_detection.aside_title)}
          </h2>
          <p className="mt-3 text-body leading-[1.7] text-muted-foreground">
            {t(($) => $.step_runtime_detection.aside_body)}
          </p>
        </div>
      </aside>
    </div>
  );
}
