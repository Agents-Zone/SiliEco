-- Space-scoped group chat metadata. Relationships are intentionally enforced
-- by the application layer; new tables do not add foreign keys.

ALTER TABLE chat_session
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'direct'
        CHECK (kind IN ('direct', 'group'));

ALTER TABLE chat_session ALTER COLUMN agent_id DROP NOT NULL;

CREATE TABLE chat_session_participant (
    chat_session_id UUID NOT NULL,
    participant_type TEXT NOT NULL CHECK (participant_type IN ('member', 'agent')),
    participant_id UUID NOT NULL,
    created_by UUID NOT NULL,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_message
    ADD COLUMN sender_user_id UUID,
    ADD COLUMN sender_agent_id UUID,
    ADD COLUMN mentioned_agent_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE agent_task_queue
    ADD COLUMN trigger_chat_message_id UUID;
