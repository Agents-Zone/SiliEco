-- Workflow definitions are reusable SOPs scoped to a workspace. Definitions
-- point at an immutable current version; relationships are validated and
-- cleaned up by the application layer rather than database foreign keys.
CREATE TABLE workflow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    current_version_id UUID,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    workflow_id UUID NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 1),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'superseded')),
    created_by UUID NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_stage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    workflow_version_id UUID NOT NULL,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_instance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    workflow_id UUID NOT NULL,
    workflow_version_id UUID NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'waiting', 'completed', 'cancelled')),
    current_stage_id UUID,
    project_id UUID,
    created_by UUID NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_gate_decision (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    workflow_instance_id UUID NOT NULL,
    from_stage_id UUID NOT NULL,
    to_stage_id UUID,
    outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'rejected')),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'agent')),
    actor_id UUID NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issue
    ADD COLUMN workflow_instance_id UUID,
    ADD COLUMN workflow_stage_id UUID,
    ADD CONSTRAINT issue_workflow_stage_pair_check CHECK (
        (workflow_instance_id IS NULL AND workflow_stage_id IS NULL)
        OR
        (workflow_instance_id IS NOT NULL AND workflow_stage_id IS NOT NULL)
    );
