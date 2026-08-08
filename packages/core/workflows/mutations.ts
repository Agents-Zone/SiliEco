import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type {
  CreateWorkflowInstanceRequest,
  CreateWorkflowRequest,
  CreateWorkflowVersionRequest,
  TransitionWorkflowInstanceRequest,
  UpdateWorkflowInstancePlanRequest,
  UpdateWorkflowRequest,
} from "../types";
import { workflowKeys } from "./queries";

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateWorkflowRequest) => api.createWorkflow(data),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: workflowKeys.all(workspaceId),
      }),
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: string;
      data: UpdateWorkflowRequest;
    }) => api.updateWorkflow(workflowId, data),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.all(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workspaceId, variables.workflowId),
      });
    },
  });
}

export function useArchiveWorkflow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (workflowId: string) => api.archiveWorkflow(workflowId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: workflowKeys.all(workspaceId),
      }),
  });
}

export function useCreateWorkflowVersion() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: string;
      data: CreateWorkflowVersionRequest;
    }) => api.createWorkflowVersion(workflowId, data),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.versions(workspaceId, variables.workflowId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.all(workspaceId),
      });
    },
  });
}

export function usePublishWorkflowVersion() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      workflowId,
      versionId,
    }: {
      workflowId: string;
      versionId: string;
    }) => api.publishWorkflowVersion(workflowId, versionId),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.versions(workspaceId, variables.workflowId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.list(workspaceId),
      });
    },
  });
}

export function useCreateWorkflowInstance() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: string;
      data: CreateWorkflowInstanceRequest;
    }) => api.createWorkflowInstance(workflowId, data),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [...workflowKeys.all(workspaceId), "instances"],
      }),
  });
}

export function useTransitionWorkflowInstance() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      instanceId,
      data,
    }: {
      instanceId: string;
      data: TransitionWorkflowInstanceRequest;
    }) => api.transitionWorkflowInstance(instanceId, data),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instance(workspaceId, variables.instanceId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instances(workspaceId),
      });
    },
  });
}

export function useUpdateWorkflowInstancePlan() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      instanceId,
      data,
    }: {
      instanceId: string;
      data: UpdateWorkflowInstancePlanRequest;
    }) => api.updateWorkflowInstancePlan(instanceId, data),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instance(workspaceId, variables.instanceId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instances(workspaceId),
      });
    },
  });
}

export function useArchiveWorkflowInstance() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (instanceId: string) => api.archiveWorkflowInstance(instanceId),
    onSettled: (_data, _error, instanceId) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instance(workspaceId, instanceId),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instances(workspaceId),
      });
    },
  });
}

export function useAttachWorkflowTask() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      instanceId,
      taskId,
      stageId,
    }: {
      instanceId: string;
      taskId: string;
      stageId: string;
    }) => api.attachWorkflowTask(instanceId, taskId, stageId),
    onSettled: (_data, _error, variables) =>
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instance(workspaceId, variables.instanceId),
      }),
  });
}

export function useDetachWorkflowTask() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({
      instanceId,
      taskId,
    }: {
      instanceId: string;
      taskId: string;
    }) => api.detachWorkflowTask(instanceId, taskId),
    onSettled: (_data, _error, variables) =>
      queryClient.invalidateQueries({
        queryKey: workflowKeys.instance(workspaceId, variables.instanceId),
      }),
  });
}
