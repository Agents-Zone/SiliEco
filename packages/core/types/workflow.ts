import type { Task } from "./issue";

export type WorkflowStatus = "draft" | "published" | "archived";
export type WorkflowVersionStatus = "draft" | "published" | "superseded";
export type WorkflowInstanceStatus =
  | "draft"
  | "active"
  | "waiting"
  | "completed"
  | "cancelled";
export type WorkflowGateType = "none" | "human" | "agent" | "hybrid";

export type WorkflowObject = Record<string, unknown>;

export interface WorkflowStage {
  id: string;
  workspace_id: string;
  workflow_version_id: string;
  stable_key: string;
  name: string;
  description: string | null;
  position: number;
  completion_rule: WorkflowObject;
  input_spec: WorkflowObject;
  output_spec: WorkflowObject;
  required_skills: string[];
  gate: WorkflowObject & { type?: WorkflowGateType };
  rollback_stage_key: string | null;
  created_at: string;
}

export interface WorkflowVersion {
  id: string;
  workspace_id: string;
  workflow_id: string;
  version: number;
  status: WorkflowVersionStatus;
  created_by: string;
  published_at: string | null;
  created_at: string;
  stages: WorkflowStage[];
}

export interface Workflow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  current_version_id: string | null;
  current_version?: WorkflowVersion;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowGateDecision {
  id: string;
  workflow_instance_id: string;
  from_stage_id: string;
  to_stage_id: string | null;
  outcome: "approved" | "rejected";
  actor_type: "member" | "agent";
  actor_id: string;
  note: string | null;
  created_at: string;
}

export interface WorkflowInstance {
  id: string;
  workspace_id: string;
  workflow_id: string;
  workflow_version_id: string;
  title: string;
  description: string | null;
  status: WorkflowInstanceStatus;
  current_stage_id: string | null;
  project_id: string | null;
  created_by: string;
  started_at: string | null;
  completed_at: string | null;
  task_count: number;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  stages?: WorkflowStage[];
  tasks?: Task[];
  decisions?: WorkflowGateDecision[];
}

export interface WorkflowStageInput {
  stable_key?: string;
  name: string;
  description?: string | null;
  completion_rule?: WorkflowObject;
  input_spec?: WorkflowObject;
  output_spec?: WorkflowObject;
  required_skills?: string[];
  gate?: WorkflowObject & { type?: WorkflowGateType };
  rollback_stage_key?: string | null;
}

export interface CreateWorkflowRequest {
  project_id?: string | null;
  name: string;
  description?: string | null;
  publish?: boolean;
  stages: WorkflowStageInput[];
}

export interface UpdateWorkflowRequest {
  project_id?: string;
  name?: string;
  description?: string | null;
}

export interface CreateWorkflowVersionRequest {
  publish?: boolean;
  stages: WorkflowStageInput[];
}

export interface CreateWorkflowInstanceRequest {
  title: string;
  description?: string | null;
  version_id?: string;
  project_id?: string | null;
  start?: boolean;
}

export interface TransitionWorkflowInstanceRequest {
  target_stage_id?: string;
  outcome?: "approved" | "rejected";
  note?: string | null;
}

export interface ListWorkflowsResponse {
  workflows: Workflow[];
  total: number;
}

export interface ListWorkflowVersionsResponse {
  versions: WorkflowVersion[];
  total: number;
}

export interface ListWorkflowInstancesResponse {
  instances: WorkflowInstance[];
  total: number;
}

export interface ListWorkflowTasksResponse {
  tasks: Task[];
  total: number;
}
