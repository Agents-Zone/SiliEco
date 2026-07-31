CREATE INDEX CONCURRENTLY idx_workflow_project_status ON workflow(project_id, status, updated_at DESC);
