CREATE UNIQUE INDEX CONCURRENTLY workflow_stage_position_index ON workflow_stage (workflow_version_id, position);
