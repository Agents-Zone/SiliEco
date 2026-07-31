"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Network } from "lucide-react";
import type { Workspace } from "@silieco/core/types";
import { Button } from "@silieco/ui/components/ui/button";
import { Textarea } from "@silieco/ui/components/ui/textarea";
import { DragStrip } from "@silieco/views/platform";
import { StepHeader } from "../components/step-header";
import { useT } from "../../i18n";

const MAX_DESCRIPTION_LENGTH = 240;

export function StepWorkspaceDescription({
  workspace,
  onComplete,
  onBack,
}: {
  workspace: Workspace;
  onComplete: (description: string) => void | Promise<void>;
  onBack?: () => void;
}) {
  const { t } = useT("onboarding");
  const [description, setDescription] = useState(workspace.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = description.trim();

  const submit = async () => {
    if (trimmed.length < 3 || submitting) return;
    setSubmitting(true);
    try {
      await onComplete(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

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
            <StepHeader currentStep="workspace_description" />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[700px] px-6 py-10 sm:px-10 md:px-14 lg:py-16">
            <div className="text-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {t(($) => $.step_workspace_description.eyebrow)}
            </div>
            <h1 className="mt-2 text-balance text-display font-semibold leading-[1.05] tracking-[-0.035em] text-foreground">
              {t(($) => $.step_workspace_description.headline)}
            </h1>
            <p className="mt-4 max-w-[600px] text-body-lg leading-[1.6] text-muted-foreground">
              {t(($) => $.step_workspace_description.lede)}
            </p>

            <div className="mt-10">
              <label
                htmlFor="workspace-description"
                className="text-caption font-medium text-foreground"
              >
                {t(($) => $.step_workspace_description.label)}
              </label>
              <Textarea
                id="workspace-description"
                autoFocus
                rows={5}
                maxLength={MAX_DESCRIPTION_LENGTH}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={t(
                  ($) => $.step_workspace_description.placeholder,
                )}
                className="mt-2 resize-none text-body-lg leading-relaxed"
              />
              <div className="mt-2 flex justify-between text-caption text-muted-foreground">
                <span>
                  {t(($) => $.step_workspace_description.hint)}
                </span>
                <span className="tabular-nums">
                  {description.length}/{MAX_DESCRIPTION_LENGTH}
                </span>
              </div>
            </div>

            <div className="mt-10 flex justify-end">
              <Button
                size="lg"
                disabled={trimmed.length < 3 || submitting}
                onClick={() => void submit()}
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {t(($) => $.step_workspace_description.finish)}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>

      <aside className="hidden min-h-0 border-l bg-muted/30 lg:flex lg:flex-col">
        <DragStrip />
        <div className="flex flex-1 flex-col justify-center px-12 py-14">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Network className="size-5" />
          </div>
          <span className="mt-8 font-mono text-caption text-primary">03 / 03</span>
          <h2 className="mt-4 text-title-lg font-semibold leading-tight text-foreground">
            {t(($) => $.step_workspace_description.aside_title)}
          </h2>
          <p className="mt-3 text-body leading-[1.7] text-muted-foreground">
            {t(($) => $.step_workspace_description.aside_body)}
          </p>
        </div>
      </aside>
    </div>
  );
}
