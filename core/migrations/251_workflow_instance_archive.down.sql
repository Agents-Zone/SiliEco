DROP INDEX IF EXISTS idx_workflow_instance_project_active;

ALTER TABLE workflow_instance
    DROP COLUMN IF EXISTS archived_by,
    DROP COLUMN IF EXISTS archived_at;
