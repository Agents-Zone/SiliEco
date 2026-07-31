CREATE UNIQUE INDEX CONCURRENTLY workflow_stage_key_index ON workflow_stage (workflow_version_id, stable_key);
