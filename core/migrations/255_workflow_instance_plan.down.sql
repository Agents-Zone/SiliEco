UPDATE issue AS task
SET workflow_instance_id = NULL,
    workflow_stage_id = NULL
FROM workflow_instance_stage AS instance_stage
WHERE task.workflow_instance_id = instance_stage.workflow_instance_id
  AND task.workflow_stage_id = instance_stage.id
  AND task.workspace_id = instance_stage.workspace_id
  AND instance_stage.source_stage_id IS NULL;

UPDATE issue AS task
SET workflow_stage_id = instance_stage.source_stage_id
FROM workflow_instance_stage AS instance_stage
WHERE task.workflow_instance_id = instance_stage.workflow_instance_id
  AND task.workflow_stage_id = instance_stage.id
  AND task.workspace_id = instance_stage.workspace_id
  AND instance_stage.source_stage_id IS NOT NULL;

DELETE FROM workflow_gate_decision AS decision
USING workflow_instance_stage AS instance_stage
WHERE decision.workflow_instance_id = instance_stage.workflow_instance_id
  AND decision.workspace_id = instance_stage.workspace_id
  AND (decision.from_stage_id = instance_stage.id OR decision.to_stage_id = instance_stage.id)
  AND instance_stage.source_stage_id IS NULL;

UPDATE workflow_gate_decision AS decision
SET from_stage_id = instance_stage.source_stage_id
FROM workflow_instance_stage AS instance_stage
WHERE decision.workflow_instance_id = instance_stage.workflow_instance_id
  AND decision.from_stage_id = instance_stage.id
  AND decision.workspace_id = instance_stage.workspace_id
  AND instance_stage.source_stage_id IS NOT NULL;

UPDATE workflow_gate_decision AS decision
SET to_stage_id = instance_stage.source_stage_id
FROM workflow_instance_stage AS instance_stage
WHERE decision.workflow_instance_id = instance_stage.workflow_instance_id
  AND decision.to_stage_id = instance_stage.id
  AND decision.workspace_id = instance_stage.workspace_id
  AND instance_stage.source_stage_id IS NOT NULL;

UPDATE workflow_instance AS instance
SET current_stage_id = instance_stage.source_stage_id
FROM workflow_instance_stage AS instance_stage
WHERE instance.id = instance_stage.workflow_instance_id
  AND instance.current_stage_id = instance_stage.id
  AND instance.workspace_id = instance_stage.workspace_id
  AND instance_stage.source_stage_id IS NOT NULL;

UPDATE workflow_instance AS instance
SET current_stage_id = (
    SELECT stage.source_stage_id
    FROM workflow_instance_stage AS stage
    WHERE stage.workflow_instance_id = instance.id
      AND stage.workspace_id = instance.workspace_id
      AND stage.source_stage_id IS NOT NULL
    ORDER BY stage.position ASC
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1
    FROM workflow_instance_stage AS current_stage
    WHERE current_stage.id = instance.current_stage_id
      AND current_stage.workflow_instance_id = instance.id
      AND current_stage.source_stage_id IS NULL
);

DROP TABLE workflow_instance_change;
ALTER TABLE workflow_instance DROP COLUMN revision;
DROP TABLE workflow_instance_stage;
