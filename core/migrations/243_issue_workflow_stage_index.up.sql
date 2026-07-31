CREATE INDEX CONCURRENTLY issue_workflow_stage_index ON issue (workflow_instance_id, workflow_stage_id, position) WHERE workflow_instance_id IS NOT NULL;
