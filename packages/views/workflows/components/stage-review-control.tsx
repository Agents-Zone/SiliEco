"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@silieco/core/auth";
import type { WorkflowInstance } from "@silieco/core/types";
import { useTransitionWorkflowInstance } from "@silieco/core/workflows";
import { Badge } from "@silieco/ui/components/ui/badge";
import { Button } from "@silieco/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@silieco/ui/components/ui/dialog";
import { Textarea } from "@silieco/ui/components/ui/textarea";
import { cn } from "@silieco/ui/lib/utils";
import { useT } from "../../i18n";

function objectString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? (value[key] as string) : "";
}

export function StageReviewControl({
  instance,
}: {
  instance: WorkflowInstance;
}) {
  const { t } = useT("workflows");
  const userId = useAuthStore((state) => state.user?.id);
  const transitionInstance = useTransitionWorkflowInstance();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const currentStage = instance.stages?.find(
    (stage) => stage.id === instance.current_stage_id,
  );

  if (!currentStage || (instance.status !== "active" && instance.status !== "waiting")) {
    const unavailableReason = currentStage
      ? t(($) => $.stage_review.run_closed, { status: instance.status })
      : t(($) => $.stage_review.no_current_stage);
    return (
      <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold">
            {t(($) => $.stage_review.panel_title)}
          </p>
          <p className="mt-0.5 text-micro text-muted-foreground">
            {unavailableReason}
          </p>
        </div>
        <Badge variant="outline">{t(($) => $.stage_review.unavailable)}</Badge>
      </div>
    );
  }

  const currentStageTasks = (instance.tasks ?? []).filter(
    (task) => task.workflow_stage_id === currentStage.id,
  );
  const openTaskCount = currentStageTasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  ).length;
  const gate = currentStage.gate ?? {};
  const currentGateType = objectString(gate, "type") || "none";
  const expectedHuman =
    objectString(gate, "human_decider") || objectString(gate, "decider");
  const humanGate = currentGateType === "human" || currentGateType === "hybrid";
  const agentGate = currentGateType === "agent";
  const canReview =
    !agentGate && (!humanGate || !expectedHuman || expectedHuman === userId);
  const rollbackStage = instance.stages?.find(
    (stage) => stage.stable_key === currentStage.rollback_stage_key,
  );
  const isFinalStage =
    instance.stages?.[instance.stages.length - 1]?.id === currentStage.id;

  const submitStageDecision = (outcome: "approved" | "rejected") => {
    transitionInstance.mutate(
      {
        instanceId: instance.id,
        data: {
          outcome,
          note: reviewNote.trim() || null,
          ...(outcome === "rejected" && rollbackStage
            ? { target_stage_id: rollbackStage.id }
            : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(
            outcome === "approved"
              ? t(($) => $.stage_review.approved)
              : t(($) => $.stage_review.rejected),
          );
          setReviewOpen(false);
          setReviewNote("");
        },
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t(($) => $.stage_review.failed),
          ),
      },
    );
  };

  return (
    <>
      <div className="flex min-h-14 flex-wrap items-center gap-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-caption font-semibold">
              {t(($) => $.stage_review.panel_title)}
            </p>
            <Badge variant="outline">{currentStage.name}</Badge>
          </div>
          <p className="mt-0.5 text-micro text-muted-foreground">
            {t(($) => $.stage_review.panel_summary, {
              complete: currentStageTasks.length - openTaskCount,
              total: currentStageTasks.length,
            })}
          </p>
        </div>
        {agentGate ? (
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3" />
            {t(($) => $.stage_review.waiting_agent)}
          </Badge>
        ) : (
          <Button
            size="sm"
            variant={openTaskCount > 0 ? "outline" : "secondary"}
            disabled={!canReview}
            title={canReview ? undefined : t(($) => $.stage_review.waiting_human)}
            onClick={() => setReviewOpen(true)}
          >
            <ShieldCheck className="size-3.5" />
            {canReview
              ? t(($) => $.stage_review.open)
              : t(($) => $.stage_review.waiting_human)}
          </Button>
        )}
      </div>

      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => {
          if (transitionInstance.isPending) return;
          setReviewOpen(open);
          if (!open) setReviewNote("");
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(($) => $.stage_review.title)}</DialogTitle>
            <DialogDescription>
              {t(($) => $.stage_review.description, { stage: currentStage.name })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-3",
                openTaskCount > 0
                  ? "border-amber-500/30 bg-amber-500/8"
                  : "border-emerald-500/25 bg-emerald-500/8",
              )}
            >
              {openTaskCount > 0 ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              )}
              <div className="min-w-0">
                <p className="text-caption font-semibold">
                  {openTaskCount > 0
                    ? t(($) => $.stage_review.tasks_incomplete, {
                        count: openTaskCount,
                      })
                    : t(($) => $.stage_review.tasks_ready)}
                </p>
                <p className="mt-0.5 text-micro leading-4 text-muted-foreground">
                  {t(($) => $.stage_review.task_summary, {
                    total: currentStageTasks.length,
                    complete: currentStageTasks.length - openTaskCount,
                  })}
                </p>
              </div>
            </div>

            <label className="block space-y-1.5 text-caption font-medium">
              <span>{t(($) => $.stage_review.note)}</span>
              <Textarea
                rows={4}
                value={reviewNote}
                placeholder={t(($) => $.stage_review.note_placeholder)}
                onChange={(event) => setReviewNote(event.target.value)}
              />
            </label>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              disabled={!rollbackStage || transitionInstance.isPending}
              onClick={() => submitStageDecision("rejected")}
            >
              {transitionInstance.isPending ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              {rollbackStage
                ? t(($) => $.stage_review.reject_to, {
                    stage: rollbackStage.name,
                  })
                : t(($) => $.stage_review.no_rollback)}
            </Button>
            <Button
              disabled={openTaskCount > 0 || transitionInstance.isPending}
              onClick={() => submitStageDecision("approved")}
            >
              {transitionInstance.isPending ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {isFinalStage
                ? t(($) => $.stage_review.complete_run)
                : t(($) => $.stage_review.approve_next)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
