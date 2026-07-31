"use client";

import {
  ONBOARDING_STEP_ORDER,
  type OnboardingStep,
} from "@silieco/core/onboarding";
import { SiliecoIcon } from "@silieco/ui/components/common/silieco-icon";
import { cn } from "@silieco/ui/lib/utils";
import { useT } from "../../i18n";

const STEP_LAYER: Record<OnboardingStep, string> = {
  welcome: "APP",
  about_you: "APP",
  workspace: "CORE",
  runtime: "DAEMON",
  workspace_description: "CONTEXT",
};

/**
 * Horizontal step indicator shown at the top of every onboarding step
 * except Welcome.
 *
 * Layout: a row of dots on the left (one per step in
 * `ONBOARDING_STEP_ORDER`) and a plaintext "Step N of M" counter on
 * the right. The dots show three states driven by the current step's
 * position in the canonical order:
 *
 *   - `done`     filled with primary color         (index < current)
 *   - `current`  filled + ring for emphasis        (index === current)
 *   - `pending`  hollow / muted                    (index > current)
 *
 * The indicator derives both its dots and text from the same source —
 * the canonical ONBOARDING_STEP_ORDER plus the caller-provided
 * `currentStep` — so adding, removing, or reordering a step only
 * requires editing the array.
 *
 * Not rendered on the Welcome screen: the caller (OnboardingFlow)
 * decides whether to include this component based on whether the
 * current render step is "welcome". See flow orchestrator for the
 * mapping from local UI step to the canonical `OnboardingStep`.
 */
export function StepHeader({ currentStep }: { currentStep: OnboardingStep }) {
  const { t } = useT("onboarding");
  const total = ONBOARDING_STEP_ORDER.length;
  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);
  // Defensive: unknown step → render a disabled-looking header rather
  // than throw. Happens if the caller's local step union and the store
  // enum drift during refactors.
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={safeIndex + 1}
      aria-label={t(($) => $.step_header.step_of, { current: safeIndex + 1, total })}
      className="flex w-full items-center justify-between gap-5 py-1"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
          <SiliecoIcon className="size-5" noSpin />
          <span className="text-label font-semibold tracking-[-0.01em]">
            Silieco
          </span>
        </div>
        <span className="hidden h-5 w-px bg-border sm:block" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {ONBOARDING_STEP_ORDER.map((stepId, i) => {
          const isDone = i < safeIndex;
          const isCurrent = i === safeIndex;
          return (
            <div
              key={stepId}
              data-onboarding-step={stepId}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 border px-2.5 py-1.5 transition-colors",
                isDone && "border-primary/20 bg-primary/5 text-primary",
                isCurrent && "border-primary/45 bg-primary/10 text-primary",
                !isDone && !isCurrent && "border-border/70 text-muted-foreground/45",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  isDone || isCurrent ? "bg-primary" : "bg-muted-foreground/25",
                )}
              />
              <span className="truncate font-mono text-micro font-semibold tracking-[0.1em]">
                {STEP_LAYER[stepId]}
              </span>
            </div>
          );
        })}
        </div>
      </div>
      <span className="text-caption font-medium text-muted-foreground">
        {t(($) => $.step_header.step_of, { current: safeIndex + 1, total })}
      </span>
    </div>
  );
}
