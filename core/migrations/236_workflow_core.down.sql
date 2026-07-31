ALTER TABLE issue
    DROP CONSTRAINT IF EXISTS issue_workflow_stage_pair_check,
    DROP COLUMN IF EXISTS workflow_stage_id,
    DROP COLUMN IF EXISTS workflow_instance_id;

DROP TABLE IF EXISTS workflow_gate_decision;
DROP TABLE IF EXISTS workflow_instance;
DROP TABLE IF EXISTS workflow_stage;
DROP TABLE IF EXISTS workflow_version;
DROP TABLE IF EXISTS workflow;
