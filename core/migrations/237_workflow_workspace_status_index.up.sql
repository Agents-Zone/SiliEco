CREATE INDEX CONCURRENTLY workflow_workspace_status_index ON workflow (workspace_id, status, updated_at DESC);
