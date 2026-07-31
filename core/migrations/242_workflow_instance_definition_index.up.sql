CREATE INDEX CONCURRENTLY workflow_instance_definition_index ON workflow_instance (workflow_id, workflow_version_id, created_at DESC);
