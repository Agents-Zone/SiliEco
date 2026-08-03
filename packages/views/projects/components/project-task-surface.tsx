"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  GitBranch,
  ListTodo,
  LoaderCircle,
  Plus,
  RotateCcw,
  Route,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@silieco/core/auth";
import { useWorkspaceId } from "@silieco/core/hooks";
import { useModalStore } from "@silieco/core/modals";
import { useWorkspacePaths } from "@silieco/core/paths";
import {
  workflowInstanceOptions,
  workflowInstancesOptions,
  useTransitionWorkflowInstance,
} from "@silieco/core/workflows";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silieco/ui/components/ui/select";
import { cn } from "@silieco/ui/lib/utils";
import { Textarea } from "@silieco/ui/components/ui/textarea";
import { IssueSurface } from "../../issues/surface/issue-surface";
import { WorkflowBoard } from "../../workflows/components";
import { useT } from "../../i18n";
import { useNavigation } from "../../navigation";

type TaskManagementMode = "lifecycle" | "stage";

function objectString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? (value[key] as string) : "";
}

export function ProjectTaskSurface({ projectId }: { projectId: string }) {
  const { t } = useT("workflows");
  const workspaceId = useWorkspaceId();
  const workspacePaths = useWorkspacePaths();
  const navigation = useNavigation();
  const userId = useAuthStore((state) => state.user?.id);
  const transitionInstance = useTransitionWorkflowInstance();
  const [mode, setMode] = useState<TaskManagementMode>("lifecycle");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const { data: runs = [] } = useQuery(
    workflowInstancesOptions(workspaceId, undefined, projectId),
  );
  const availableRuns = useMemo(
    () =>
      runs.filter(
        (run) =>
          !run.archived_at &&
          run.status !== "completed" &&
          run.status !== "cancelled",
      ),
    [runs],
  );
  const hasAvailableRuns = availableRuns.length > 0;
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const effectiveMode: TaskManagementMode =
    mode === "stage" && !hasAvailableRuns ? "lifecycle" : mode;

  useEffect(() => {
    setMode("lifecycle");
    setSelectedRunId(undefined);
  }, [projectId]);

  useEffect(() => {
    if (!hasAvailableRuns && mode === "stage") {
      setMode("lifecycle");
    }
  }, [hasAvailableRuns, mode]);

  useEffect(() => {
    if (
      !selectedRunId ||
      !availableRuns.some((run) => run.id === selectedRunId)
    ) {
      setSelectedRunId(availableRuns[0]?.id);
    }
  }, [availableRuns, selectedRunId]);
  const { data: selectedRun } = useQuery({
    ...workflowInstanceOptions(workspaceId, selectedRunId ?? ""),
    enabled: effectiveMode === "stage" && Boolean(selectedRunId),
  });
  const currentStage = selectedRun?.stages?.find(
    (stage) => stage.id === selectedRun.current_stage_id,
  );
  const currentStageTasks = (selectedRun?.tasks ?? []).filter(
    (task) => task.workflow_stage_id === currentStage?.id,
  );
  const openTaskCount = currentStageTasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  ).length;
  const gate = currentStage?.gate ?? {};
  const gateType = objectString(gate, "type") || "none";
  const expectedHuman =
    objectString(gate, "human_decider") || objectString(gate, "decider");
  const humanGate = gateType === "human" || gateType === "hybrid";
  const agentGate = gateType === "agent";
  const canReview =
    !agentGate && (!humanGate || !expectedHuman || expectedHuman === userId);
  const rollbackStage = selectedRun?.stages?.find(
    (stage) => stage.stable_key === currentStage?.rollback_stage_key,
  );
  const isFinalStage =
    Boolean(currentStage) &&
    selectedRun?.stages?.[selectedRun.stages.length - 1]?.id === currentStage?.id;

  const submitStageDecision = (outcome: "approved" | "rejected") => {
    if (!selectedRun || !currentStage) return;
    transitionInstance.mutate(
      {
        instanceId: selectedRun.id,
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

  const openStageTask = () => {
    const stage =
      selectedRun?.stages?.find(
        (item) => item.id === selectedRun.current_stage_id,
      ) ?? selectedRun?.stages?.[0];
    if (!selectedRun || !stage) return;
    useModalStore.getState().open("create-issue", {
      project_id: projectId,
      workflow_instance_id: selectedRun.id,
      workflow_stage_id: stage.id,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              type="button"
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium transition-colors",
                effectiveMode === "lifecycle"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode("lifecycle")}
            >
              <ListTodo className="size-3.5" />
              {t(($) => $.project_tasks.lifecycle)}
            </button>
            <button
              type="button"
              disabled={!hasAvailableRuns}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium transition-colors",
                effectiveMode === "stage"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                !hasAvailableRuns && "cursor-not-allowed opacity-45",
              )}
              onClick={() => {
                if (hasAvailableRuns) setMode("stage");
              }}
            >
              <GitBranch className="size-3.5" />
              {t(($) => $.project_tasks.stage)}
            </button>
          </div>
          <span className="hidden text-caption text-muted-foreground sm:inline">
            {effectiveMode === "lifecycle"
              ? t(($) => $.project_tasks.lifecycle_hint)
              : t(($) => $.project_tasks.stage_hint)}
          </span>
        </div>

        {effectiveMode === "stage" && hasAvailableRuns && (
          <div className="flex items-center gap-2">
            <Select
              items={availableRuns.map((run) => ({
                value: run.id,
                label: run.title,
              }))}
              value={selectedRunId}
              onValueChange={(value) => {
                if (value) setSelectedRunId(value);
              }}
            >
              <SelectTrigger
                size="sm"
                className="max-w-56"
                aria-label={t(($) => $.assignment.select_run)}
              >
                <Route className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="end"
                alignItemWithTrigger={false}
                className="max-h-72"
              >
                {availableRuns.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    <Route className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{run.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRun && (
              <Badge variant="secondary">{selectedRun.status}</Badge>
            )}
            {selectedRun && currentStage && (
              agentGate ? (
                <Badge variant="outline" className="gap-1.5">
                  <ShieldCheck className="size-3" />
                  {t(($) => $.stage_review.waiting_agent)}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant={openTaskCount > 0 ? "outline" : "secondary"}
                  disabled={!canReview}
                  title={
                    canReview
                      ? undefined
                      : t(($) => $.stage_review.waiting_human)
                  }
                  onClick={() => setReviewOpen(true)}
                >
                  <ShieldCheck className="size-3.5" />
                  {canReview
                    ? t(($) => $.stage_review.open)
                    : t(($) => $.stage_review.waiting_human)}
                </Button>
              )
            )}
            <Button
              size="sm"
              disabled={!selectedRun?.stages?.length}
              onClick={openStageTask}
            >
              <Plus className="size-3.5" />
              {t(($) => $.project_tasks.create_task)}
            </Button>
          </div>
        )}
      </div>

      {effectiveMode === "lifecycle" ? (
        <IssueSurface
          scope={{ type: "project", projectId }}
          modes={["board", "list", "table", "swimlane", "gantt"]}
        />
      ) : selectedRun ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
          <WorkflowBoard instance={selectedRun} mode="stage" />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <GitBranch className="size-5" />
            </div>
            <h3 className="mt-4 text-title-sm font-semibold">
              {t(($) => $.project_tasks.empty_title)}
            </h3>
            <p className="mt-1.5 text-body leading-6 text-muted-foreground">
              {t(($) => $.project_tasks.empty_description)}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() =>
                navigation.replace(
                  `${workspacePaths.projectDetail(projectId)}?section=sop`,
                )
              }
            >
              <GitBranch className="size-3.5" />
              {t(($) => $.project_tasks.open_sop)}
            </Button>
          </div>
        </div>
      )}

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
              {t(($) => $.stage_review.description, {
                stage: currentStage?.name ?? "",
              })}
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
    </div>
  );
}
