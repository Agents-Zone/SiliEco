"use client";

import { useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  FileInput,
  FileOutput,
  GitBranch,
  LayoutTemplate,
  LoaderCircle,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceId } from "@silieco/core/hooks";
import type { WorkflowGateType } from "@silieco/core/types";
import {
  useCreateWorkflow,
  useCreateWorkflowInstance,
  workflowInstancesOptions,
  workflowListOptions,
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
import { Input } from "@silieco/ui/components/ui/input";
import { Switch } from "@silieco/ui/components/ui/switch";
import { Textarea } from "@silieco/ui/components/ui/textarea";
import { cn } from "@silieco/ui/lib/utils";
import { useT } from "../../i18n";

type StageStatus = string;
type CanonicalStageStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked";
type DeciderType = "human" | "self_agent" | "agent";
interface SopStageDraft {
  id: string;
  name: string;
  statuses: StageStatus[];
  input: string;
  output: string;
  skills: string;
  gateEnabled: boolean;
  deciderType: DeciderType;
  decider: string;
  requireHuman: boolean;
}
interface SopTemplate {
  id: string;
  name: string;
  description: string;
  source: "preset" | "blank";
  stages: Array<Omit<SopStageDraft, "id">>;
}

const DEFAULT_STATUSES: StageStatus[] = ["todo", "in_progress", "done"];
const ALL_STATUSES: CanonicalStageStatus[] = ["backlog", "todo", "in_progress", "in_review", "done", "blocked"];
function stage(
  name: string,
  input: string,
  output: string,
  skills: string,
  gate: Partial<Omit<SopStageDraft, "id" | "name" | "input" | "output" | "skills">> = {},
): Omit<SopStageDraft, "id"> {
  return {
    name,
    statuses: gate.statuses ?? DEFAULT_STATUSES,
    input,
    output,
    skills,
    gateEnabled: gate.gateEnabled ?? false,
    deciderType: gate.deciderType ?? "human",
    decider: gate.decider ?? "",
    requireHuman: gate.requireHuman ?? false,
  };
}

export const SOP_TEMPLATES: SopTemplate[] = [
  {
    id: "bid",
    name: "投标模板",
    description: "从招标文件分析到审核、得分点比较的完整交付流程。",
    source: "preset",
    stages: [
      stage("招标文件分析", "招标公告.pdf", "分析报告.md", "招标文件解析, 得分点提取"),
      stage("投标方案制定", "分析报告.md", "投标方案.md", "方案撰写"),
      stage("投标标书编写", "投标方案.md", "技术标.md / 商务标.md", "标书生成"),
      stage("审核校验", "技术标.md / 商务标.md", "审核意见.md", "合规校验", {
        statuses: ["todo", "in_review", "done"],
        gateEnabled: true,
        deciderType: "human",
        decider: "@bid-lead",
        requireHuman: true,
      }),
      stage("得分点比较", "全部产出物", "得分分析.md", "得分点提取"),
    ],
  },
  {
    id: "software",
    name: "软件开发模板",
    description: "覆盖需求、架构、开发、测试和发布验收。",
    source: "preset",
    stages: [
      stage("需求设计", "产品需求", "PRD.md", "需求拆解"),
      stage("架构设计", "PRD.md", "架构文档.md / API 设计.md", "架构设计, 接口设计"),
      stage("开发实现", "架构文档.md", "代码 + 单元测试", "编码, TDD", {
        statuses: ["todo", "in_progress", "in_review", "done"],
        gateEnabled: true,
        deciderType: "self_agent",
        decider: "@self",
      }),
      stage("E2E 测试", "代码", "测试报告.md", "E2E 测试"),
      stage("发布验收", "测试报告.md", "发布说明.md", "发布", {
        gateEnabled: true,
        deciderType: "human",
        decider: "@pm",
        requireHuman: true,
      }),
    ],
  },
  {
    id: "bugfix",
    name: "Bug 修复模板",
    description: "用最短路径完成问题定位、修复实现和验证确认。",
    source: "preset",
    stages: [
      stage("问题复现与定位", "Bug 描述", "根因分析.md", "调试"),
      stage("修复实现", "根因分析.md", "修复代码 + 单元测试", "编码"),
      stage("验证确认", "修复代码", "验证报告.md", "测试", {
        statuses: ["todo", "in_review", "done"],
        gateEnabled: true,
        deciderType: "self_agent",
        decider: "@self",
      }),
    ],
  },
  {
    id: "document",
    name: "通用文档协作模板",
    description: "适用于多人和 Agent 共同完成文档编写与评审。",
    source: "preset",
    stages: [
      stage("大纲设计", "需求说明", "大纲.md", ""),
      stage("内容撰写", "大纲.md", "正文.md", ""),
      stage("评审修订", "正文.md", "修订版.md", "", {
        statuses: ["todo", "in_review", "done"],
        gateEnabled: true,
        deciderType: "agent",
        decider: "@review-agent",
      }),
      stage("审核定稿", "修订版.md", "终稿.md", ""),
    ],
  },
  {
    id: "blank",
    name: "空白 SOP",
    description: "从一个空白 Stage 开始设计当前 Project 的流程。",
    source: "blank",
    stages: [stage("", "", "", "")],
  },
];

let stageSequence = 0;
function cloneStages(template: SopTemplate) {
  return template.stages.map((item) => ({
    ...item,
    statuses: [...item.statuses],
    id: `sop-stage-${++stageSequence}`,
  }));
}
function resolvedGateType(item: SopStageDraft): WorkflowGateType {
  if (!item.gateEnabled) return "none";
  if (item.deciderType === "human") return "human";
  return item.requireHuman ? "hybrid" : "agent";
}

export function ProjectSopDesigner({ projectId }: { projectId: string }) {
  const { t } = useT("workflows");
  const workspaceId = useWorkspaceId();
  const { data: workflows = [], isLoading } = useQuery(workflowListOptions(workspaceId, projectId));
  const { data: runs = [] } = useQuery(
    workflowInstancesOptions(workspaceId, undefined, projectId),
  );
  const createWorkflow = useCreateWorkflow();
  const createInstance = useCreateWorkflowInstance();
  const [startingWorkflowId, setStartingWorkflowId] = useState<string>();
  const [workflowToStart, setWorkflowToStart] = useState<{
    id: string;
    name: string;
  }>();
  const [runName, setRunName] = useState("");
  const [editing, setEditing] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSource, setTemplateSource] = useState<SopTemplate["source"]>("blank");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<SopStageDraft[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const begin = (template: SopTemplate) => {
    const nextStages = cloneStages(template);
    setTemplateName(template.name);
    setTemplateSource(template.source);
    setName(template.source === "blank" ? "" : template.name);
    setDescription(template.source === "blank" ? "" : template.description);
    setStages(nextStages);
    setExpanded(new Set(nextStages.map((item) => item.id)));
    setEditing(true);
  };
  const updateStage = (id: string, patch: Partial<Omit<SopStageDraft, "id">>) =>
    setStages((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const moveStage = (index: number, delta: -1 | 1) =>
    setStages((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  const addStage = () => {
    const item = cloneStages(SOP_TEMPLATES[4]!)[0]!;
    setStages((current) => [...current, item]);
    setExpanded((current) => new Set(current).add(item.id));
  };
  const addCustomStatus = (event: KeyboardEvent<HTMLInputElement>, item: SopStageDraft) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = event.currentTarget.value.trim();
    if (!value || item.statuses.includes(value)) return;
    updateStage(item.id, { statuses: [...item.statuses, value] });
    event.currentTarget.value = "";
  };
  const publish = () => {
    const validStages = stages.filter((item) => item.name.trim());
    if (!name.trim() || validStages.length === 0) return;
    createWorkflow.mutate(
      {
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || null,
        publish: true,
        stages: validStages.map((item, index) => ({
          stable_key: `stage_${index + 1}`,
          name: item.name.trim(),
          completion_rule: { type: "all_tasks_terminal", allowed_task_statuses: item.statuses },
          input_spec: item.input.trim() ? { default_artifact: item.input.trim() } : {},
          output_spec: item.output.trim() ? { default_artifact: item.output.trim() } : {},
          required_skills: item.skills.split(",").map((value) => value.trim()).filter(Boolean),
          gate: {
            type: resolvedGateType(item),
            decider_type: item.deciderType,
            decider: item.decider.trim() || null,
            require_human: item.requireHuman,
          },
          rollback_stage_key: item.gateEnabled && index > 0 ? `stage_${index}` : null,
        })),
      },
      {
        onSuccess: () => {
          toast.success(t(($) => $.designer.created));
          setEditing(false);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : t(($) => $.designer.create_failed)),
      },
    );
  };
  const prepareStartWorkflow = (workflowId: string, workflowName: string) => {
    const sequence =
      runs.filter((run) => run.workflow_id === workflowId).length + 1;
    setWorkflowToStart({ id: workflowId, name: workflowName });
    setRunName(
      t(($) => $.designer.run_default_name, {
        name: workflowName,
        sequence,
      }),
    );
  };
  const startWorkflow = () => {
    const title = runName.trim();
    if (!workflowToStart || !title) return;
    setStartingWorkflowId(workflowToStart.id);
    createInstance.mutate(
      {
        workflowId: workflowToStart.id,
        data: {
          title,
          project_id: projectId,
          start: true,
        },
      },
      {
        onSuccess: () => {
          toast.success(t(($) => $.designer.run_started));
          setWorkflowToStart(undefined);
          setRunName("");
        },
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t(($) => $.designer.run_failed),
          ),
        onSettled: () => setStartingWorkflowId(undefined),
      },
    );
  };

  if (!editing) {
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-5xl px-5 py-5">
          <header className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-brand" />
                <h2 className="text-title-sm font-semibold">{t(($) => $.designer.library_title)}</h2>
                <Badge variant="secondary">{workflows.length}</Badge>
              </div>
              <p className="mt-1 max-w-2xl text-body text-muted-foreground">{t(($) => $.designer.library_description)}</p>
            </div>
            <Button size="sm" onClick={() => begin(SOP_TEMPLATES[4]!)}>
              <Plus className="size-3.5" />
              {t(($) => $.page.create)}
            </Button>
          </header>

          <section className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <LayoutTemplate className="size-4 text-muted-foreground" />
              <h3 className="text-body font-semibold">{t(($) => $.designer.templates)}</h3>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {SOP_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="group flex min-h-24 items-start gap-3 rounded-xl border border-border/80 p-3 text-left hover:border-brand/35 hover:bg-brand/5"
                  onClick={() => begin(template)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-brand/10 group-hover:text-brand">
                    {template.source === "blank" ? <Plus className="size-4" /> : <GitBranch className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-body font-semibold">{template.name}</span>
                      <span className="text-micro text-muted-foreground">{t(($) => $.designer.stage_count, { count: template.stages.length })}</span>
                    </span>
                    <span className="mt-1 block text-caption leading-5 text-muted-foreground">{template.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-2 flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <h3 className="text-body font-semibold">{t(($) => $.designer.existing)}</h3>
            </div>
            {isLoading ? (
              <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
            ) : workflows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center">
                <p className="text-body font-medium">{t(($) => $.page.empty_title)}</p>
                <p className="mt-1 text-caption text-muted-foreground">{t(($) => $.designer.empty_existing)}</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/80">
                {workflows.map((workflow, index) => (
                  <div key={workflow.id} className={cn("flex min-h-14 items-center gap-3 px-3 py-2.5", index > 0 && "border-t border-border/70")}>
                    <span className="flex size-8 items-center justify-center rounded-lg bg-brand/8 text-brand"><GitBranch className="size-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium">{workflow.name}</span>
                      <span className="block truncate text-caption text-muted-foreground">{workflow.description || t(($) => $.designer.no_description)}</span>
                    </span>
                    <span className="text-caption text-muted-foreground">{t(($) => $.designer.stage_count, { count: workflow.current_version?.stages.length ?? 0 })}</span>
                    <span className="text-caption text-muted-foreground">
                      {t(($) => $.designer.active_runs, {
                        count: runs.filter(
                          (run) =>
                            run.workflow_id === workflow.id &&
                            run.status !== "completed" &&
                            run.status !== "cancelled",
                        ).length,
                      })}
                    </span>
                    <Badge variant="secondary">{t(($) => $.detail[workflow.status as keyof typeof $.detail])}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        workflow.status !== "published" ||
                        createInstance.isPending
                      }
                      onClick={() =>
                        prepareStartWorkflow(workflow.id, workflow.name)
                      }
                    >
                      {startingWorkflowId === workflow.id ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      {startingWorkflowId === workflow.id
                        ? t(($) => $.designer.starting_run)
                        : t(($) => $.designer.start_run)}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          </div>
        </div>
        <Dialog
          open={Boolean(workflowToStart)}
          onOpenChange={(open) => {
            if (open || createInstance.isPending) return;
            setWorkflowToStart(undefined);
            setRunName("");
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(($) => $.designer.run_dialog_title)}</DialogTitle>
              <DialogDescription>
                {t(($) => $.designer.run_dialog_description, {
                  name: workflowToStart?.name ?? "",
                })}
              </DialogDescription>
            </DialogHeader>
            <label className="space-y-1.5 text-caption font-medium">
              <span>{t(($) => $.designer.run_name)}</span>
              <Input
                autoFocus
                value={runName}
                placeholder={t(($) => $.designer.run_name_placeholder)}
                onChange={(event) => setRunName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    startWorkflow();
                  }
                }}
              />
            </label>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={createInstance.isPending}
                onClick={() => {
                  setWorkflowToStart(undefined);
                  setRunName("");
                }}
              >
                {t(($) => $.designer.cancel_run)}
              </Button>
              <Button
                disabled={createInstance.isPending || !runName.trim()}
                onClick={startWorkflow}
              >
                {createInstance.isPending ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {createInstance.isPending
                  ? t(($) => $.designer.starting_run)
                  : t(($) => $.designer.confirm_start)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex min-h-14 items-center gap-3 border-b border-border/70 px-5 py-2">
        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(false)}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-body font-semibold">{t(($) => $.designer.editor_title)}</h2>
            <Badge variant="secondary">{templateName}</Badge>
          </div>
          <p className="text-caption text-muted-foreground">{t(($) => $.designer.editor_hint)}</p>
        </div>
        <Button size="sm" disabled={createWorkflow.isPending || !name.trim() || !stages.some((item) => item.name.trim())} onClick={publish}>
          <Sparkles className="size-3.5" />
          {createWorkflow.isPending ? t(($) => $.designer.publishing) : t(($) => $.designer.publish)}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 py-5">
          <div className="space-y-3">
            <label className="block space-y-1.5 text-caption font-medium">
              <span>{t(($) => $.create.name)}</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t(($) => $.create.name_placeholder)} autoFocus />
            </label>
            <label className="block space-y-1.5 text-caption font-medium">
              <span>{t(($) => $.create.description)}</span>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t(($) => $.create.description_placeholder)} rows={2} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
                <span className="block text-micro font-medium text-muted-foreground">{t(($) => $.designer.source)}</span>
                <span className="mt-0.5 block text-caption font-medium">
                  {templateSource === "preset" ? t(($) => $.designer.source_preset) : t(($) => $.designer.source_user)}
                </span>
              </div>
              <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
                <span className="block text-micro font-medium text-muted-foreground">{t(($) => $.designer.scope)}</span>
                <span className="mt-0.5 block text-caption font-medium">{t(($) => $.designer.scope_project)}</span>
              </div>
            </div>
          </div>

          <div className="mb-2 mt-6">
            <h3 className="text-body font-semibold">{t(($) => $.designer.stage_list, { count: stages.length })}</h3>
            <p className="text-caption text-muted-foreground">{t(($) => $.designer.stage_list_hint)}</p>
          </div>
          <div className="space-y-2.5">
            {stages.map((item, index) => {
              const open = expanded.has(item.id);
              return (
                <section key={item.id} className={cn("overflow-hidden rounded-xl border bg-muted/20", item.gateEnabled ? "border-amber-500/35 bg-amber-500/5" : "border-border/80")}>
                  <div className="flex min-h-11 items-center gap-2 px-3">
                    <button
                      type="button"
                      className={cn("flex size-6 shrink-0 items-center justify-center rounded-md text-micro font-semibold text-white", item.gateEnabled ? "bg-amber-600" : "bg-brand")}
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })}
                    >{index + 1}</button>
                    <Input
                      value={item.name}
                      onChange={(event) => updateStage(item.id, { name: event.target.value })}
                      placeholder={t(($) => $.create.stage_placeholder)}
                      className="h-8 border-transparent bg-transparent px-1 text-body font-semibold shadow-none focus-visible:border-input focus-visible:bg-background"
                    />
                    {item.gateEnabled && <ShieldCheck className="size-3.5 shrink-0 text-amber-600" />}
                    <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} title={t(($) => $.designer.move_up)} onClick={() => moveStage(index, -1)}><ArrowUp /></Button>
                    <Button type="button" variant="ghost" size="icon-xs" disabled={index === stages.length - 1} title={t(($) => $.designer.move_down)} onClick={() => moveStage(index, 1)}><ArrowDown /></Button>
                    <Button type="button" variant="ghost" size="icon-xs" disabled={stages.length === 1} title={t(($) => $.designer.delete_stage)} className="text-muted-foreground hover:text-destructive" onClick={() => setStages((current) => current.filter((value) => value.id !== item.id))}><Trash2 /></Button>
                  </div>

                  {open && (
                    <div className="space-y-4 border-t border-border/70 bg-background/70 px-3 py-3">
                      <div>
                        <label className="mb-1.5 block text-caption font-medium">{t(($) => $.designer.statuses)}</label>
                        <div className="flex flex-wrap gap-1.5">
                          {ALL_STATUSES.map((status) => {
                            const active = item.statuses.includes(status);
                            return (
                              <button
                                key={status}
                                type="button"
                                className={cn("flex h-7 items-center gap-1.5 rounded-md border px-2 text-caption", active ? "border-brand/40 bg-brand/8 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}
                                onClick={() => updateStage(item.id, { statuses: active ? item.statuses.filter((value) => value !== status) : [...item.statuses, status] })}
                              >
                                {active && <Check className="size-3" />}
                                {t(($) => $.designer.status[status])}
                              </button>
                            );
                          })}
                          {item.statuses
                            .filter((status) => !ALL_STATUSES.includes(status as CanonicalStageStatus))
                            .map((status) => (
                              <button
                                key={status}
                                type="button"
                                className="flex h-7 items-center gap-1.5 rounded-md border border-brand/40 bg-brand/8 px-2 text-caption text-foreground"
                                title={t(($) => $.designer.remove_status)}
                                onClick={() => updateStage(item.id, {
                                  statuses: item.statuses.filter((value) => value !== status),
                                })}
                              >
                                <Check className="size-3" />
                                {status}
                              </button>
                            ))}
                          <Input className="h-7 w-36 text-caption" placeholder={t(($) => $.designer.custom_status)} onKeyDown={(event) => addCustomStatus(event, item)} />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-caption font-medium">
                          <span className="flex items-center gap-1.5"><FileInput className="size-3.5 text-muted-foreground" />{t(($) => $.designer.default_input)}</span>
                          <Input value={item.input} onChange={(event) => updateStage(item.id, { input: event.target.value })} placeholder={t(($) => $.designer.input_placeholder)} />
                        </label>
                        <label className="space-y-1.5 text-caption font-medium">
                          <span className="flex items-center gap-1.5"><FileOutput className="size-3.5 text-muted-foreground" />{t(($) => $.designer.default_output)}</span>
                          <Input value={item.output} onChange={(event) => updateStage(item.id, { output: event.target.value })} placeholder={t(($) => $.designer.output_placeholder)} />
                        </label>
                      </div>
                      <label className="space-y-1.5 text-caption font-medium">
                        <span className="flex items-center gap-1.5"><Wrench className="size-3.5 text-muted-foreground" />{t(($) => $.designer.required_skills)}</span>
                        <Input value={item.skills} onChange={(event) => updateStage(item.id, { skills: event.target.value })} placeholder={t(($) => $.designer.skills_placeholder)} />
                      </label>

                      <div className={cn("rounded-lg border px-3 py-2.5", item.gateEnabled ? "border-amber-500/35 bg-amber-500/5" : "border-dashed border-border")}>
                        <div className="flex items-center gap-2">
                          <Switch checked={item.gateEnabled} onCheckedChange={(checked) => updateStage(item.id, { gateEnabled: checked })} />
                          <span className="text-caption font-medium">{t(($) => $.designer.gate)}</span>
                        </div>
                        {item.gateEnabled && (
                          <div className="mt-3 space-y-3 border-t border-amber-500/20 pt-3">
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              {(["human", "self_agent", "agent"] as DeciderType[]).map((type) => (
                                <label key={type} className="flex cursor-pointer items-center gap-1.5 text-caption">
                                  <input
                                    type="radio"
                                    name={`decider-${item.id}`}
                                    checked={item.deciderType === type}
                                    onChange={() => updateStage(item.id, {
                                      deciderType: type,
                                      decider: type === "human" ? "@owner" : type === "self_agent" ? "@self" : "@review-agent",
                                    })}
                                  />
                                  {t(($) => $.designer.decider[type])}
                                </label>
                              ))}
                            </div>
                            <Input value={item.decider} onChange={(event) => updateStage(item.id, { decider: event.target.value })} placeholder={t(($) => $.designer.decider_placeholder)} />
                            <label className="flex items-start gap-2 text-caption text-muted-foreground">
                              <input type="checkbox" className="mt-0.5" checked={item.requireHuman} onChange={(event) => updateStage(item.id, { requireHuman: event.target.checked })} />
                              {t(($) => $.designer.require_human)}
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <button type="button" className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-caption font-medium text-brand hover:border-brand/40 hover:bg-brand/5" onClick={addStage}>
            <Plus className="size-3.5" />
            {t(($) => $.create.add_stage)}
          </button>
        </div>
      </div>
    </div>
  );
}
