/**
 * Canonical Task domain entrypoint.
 *
 * During the non-breaking migration, implementation modules remain shared
 * with the legacy `issues` entrypoint. This lets new code speak Task while
 * old desktop/mobile builds continue to interoperate with the same server.
 */
export * from "../issues/index";
export type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskAssigneeType,
  TaskMetadata,
  TaskMetadataValue,
  TaskReaction,
  CreateTaskRequest,
  UpdateTaskRequest,
  MoveTaskRequest,
  ListTasksParams,
  ListTasksResponse,
  GroupedTasksResponse,
} from "../types";
