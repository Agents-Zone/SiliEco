ALTER TABLE workflow
    ADD COLUMN project_id UUID;

UPDATE workflow AS workflow_row
SET project_id = candidate.project_id
FROM (
    SELECT
        workflow_id,
        MIN(project_id::text)::uuid AS project_id
    FROM workflow_instance
    WHERE project_id IS NOT NULL
    GROUP BY workflow_id
    HAVING COUNT(DISTINCT project_id) = 1
) AS candidate
WHERE workflow_row.id = candidate.workflow_id;

UPDATE issue AS task
SET project_id = instance.project_id
FROM workflow_instance AS instance
WHERE task.workflow_instance_id = instance.id
  AND task.project_id IS NULL
  AND instance.project_id IS NOT NULL;
