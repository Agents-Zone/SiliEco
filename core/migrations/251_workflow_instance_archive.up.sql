ALTER TABLE workflow_instance
    ADD COLUMN archived_at TIMESTAMPTZ,
    ADD COLUMN archived_by UUID REFERENCES "user"(id);

CREATE INDEX idx_workflow_instance_project_active
    ON workflow_instance(workspace_id, project_id, updated_at DESC)
    WHERE archived_at IS NULL;
