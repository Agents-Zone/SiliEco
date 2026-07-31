import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const workflowKeys = {
  all: (workspaceId: string) => ["workflows", workspaceId] as const,
  list: (workspaceId: string, projectId?: string) =>
    [
      ...workflowKeys.all(workspaceId),
      "list",
      projectId ?? "all-projects",
    ] as const,
  detail: (workspaceId: string, workflowId: string) =>
    [...workflowKeys.all(workspaceId), "detail", workflowId] as const,
  versions: (workspaceId: string, workflowId: string) =>
    [...workflowKeys.detail(workspaceId, workflowId), "versions"] as const,
  instances: (
    workspaceId: string,
    workflowId?: string,
    projectId?: string,
  ) =>
    [
      ...workflowKeys.all(workspaceId),
      "instances",
      workflowId ?? "all",
      projectId ?? "all-projects",
    ] as const,
  instance: (workspaceId: string, instanceId: string) =>
    [...workflowKeys.all(workspaceId), "instance", instanceId] as const,
};

export function workflowListOptions(workspaceId: string, projectId?: string) {
  return queryOptions({
    queryKey: workflowKeys.list(workspaceId, projectId),
    queryFn: () => api.listWorkflows({ projectId }),
    select: (data) => data.workflows,
  });
}

export function workflowDetailOptions(
  workspaceId: string,
  workflowId: string,
) {
  return queryOptions({
    queryKey: workflowKeys.detail(workspaceId, workflowId),
    queryFn: () => api.getWorkflow(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function workflowVersionsOptions(
  workspaceId: string,
  workflowId: string,
) {
  return queryOptions({
    queryKey: workflowKeys.versions(workspaceId, workflowId),
    queryFn: () => api.listWorkflowVersions(workflowId),
    select: (data) => data.versions,
    enabled: Boolean(workflowId),
  });
}

export function workflowInstancesOptions(
  workspaceId: string,
  workflowId?: string,
  projectId?: string,
) {
  return queryOptions({
    queryKey: workflowKeys.instances(workspaceId, workflowId, projectId),
    queryFn: () => api.listWorkflowInstances({ workflowId, projectId }),
    select: (data) => data.instances,
  });
}

export function workflowInstanceOptions(
  workspaceId: string,
  instanceId: string,
) {
  return queryOptions({
    queryKey: workflowKeys.instance(workspaceId, instanceId),
    queryFn: () => api.getWorkflowInstance(instanceId),
    enabled: Boolean(instanceId),
  });
}
