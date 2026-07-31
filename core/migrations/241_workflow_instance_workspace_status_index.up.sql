CREATE INDEX CONCURRENTLY workflow_instance_workspace_status_index ON workflow_instance (workspace_id, status, updated_at DESC);
