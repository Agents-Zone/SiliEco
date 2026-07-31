CREATE INDEX CONCURRENTLY idx_workflow_instance_project_status ON workflow_instance(project_id, status, updated_at DESC);
