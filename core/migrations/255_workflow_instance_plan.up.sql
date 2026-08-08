CREATE TABLE workflow_instance_stage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    workflow_instance_id UUID NOT NULL,
    source_stage_id UUID,
    stable_key TEXT NOT NULL CHECK (length(trim(stable_key)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    position INTEGER NOT NULL CHECK (position >= 0),
    completion_rule JSONB NOT NULL DEFAULT '{"type":"all_tasks_terminal"}'::jsonb
        CHECK (jsonb_typeof(completion_rule) = 'object'),
    input_spec JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(input_spec) = 'object'),
    output_spec JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(output_spec) = 'object'),
    required_skills TEXT[] NOT NULL DEFAULT '{}',
    gate JSONB NOT NULL DEFAULT '{"type":"none"}'::jsonb
        CHECK (jsonb_typeof(gate) = 'object'),
    rollback_stage_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflow_instance
    ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);

CREATE TABLE workflow_instance_change (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    workflow_instance_id UUID NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 2),
    changed_by UUID NOT NULL,
    change_note TEXT,
    before_plan JSONB NOT NULL CHECK (jsonb_typeof(before_plan) = 'object'),
    after_plan JSONB NOT NULL CHECK (jsonb_typeof(after_plan) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO workflow_instance_stage (
    workspace_id, workflow_instance_id, source_stage_id, stable_key, name,
    description, position, completion_rule, input_spec, output_spec,
    required_skills, gate, rollback_stage_key, created_at, updated_at
)
SELECT
    instance.workspace_id, instance.id, stage.id, stage.stable_key, stage.name,
    stage.description, stage.position, stage.completion_rule, stage.input_spec,
    stage.output_spec, stage.required_skills, stage.gate,
    stage.rollback_stage_key, instance.created_at, instance.updated_at
FROM workflow_instance AS instance
JOIN workflow_stage AS stage
  ON stage.workflow_version_id = instance.workflow_version_id
 AND stage.workspace_id = instance.workspace_id;

UPDATE issue AS task
SET workflow_stage_id = instance_stage.id
FROM workflow_instance_stage AS instance_stage
WHERE task.workflow_instance_id = instance_stage.workflow_instance_id
  AND task.workflow_stage_id = instance_stage.source_stage_id
  AND task.workspace_id = instance_stage.workspace_id;

UPDATE workflow_gate_decision AS decision
SET from_stage_id = instance_stage.id
FROM workflow_instance_stage AS instance_stage
WHERE decision.workflow_instance_id = instance_stage.workflow_instance_id
  AND decision.from_stage_id = instance_stage.source_stage_id
  AND decision.workspace_id = instance_stage.workspace_id;

UPDATE workflow_gate_decision AS decision
SET to_stage_id = instance_stage.id
FROM workflow_instance_stage AS instance_stage
WHERE decision.workflow_instance_id = instance_stage.workflow_instance_id
  AND decision.to_stage_id = instance_stage.source_stage_id
  AND decision.workspace_id = instance_stage.workspace_id;

UPDATE workflow_instance AS instance
SET current_stage_id = instance_stage.id
FROM workflow_instance_stage AS instance_stage
WHERE instance.id = instance_stage.workflow_instance_id
  AND instance.current_stage_id = instance_stage.source_stage_id
  AND instance.workspace_id = instance_stage.workspace_id;
