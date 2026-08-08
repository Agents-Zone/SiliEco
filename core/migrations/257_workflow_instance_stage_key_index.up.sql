CREATE UNIQUE INDEX CONCURRENTLY workflow_instance_stage_key_idx ON workflow_instance_stage (workflow_instance_id, stable_key);
