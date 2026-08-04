CREATE TABLE attachment_reference (
    id            UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL,
    attachment_id UUID NOT NULL,
    target_type   TEXT NOT NULL CHECK (target_type IN ('issue', 'project')),
    target_id     UUID NOT NULL,
    created_by    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
