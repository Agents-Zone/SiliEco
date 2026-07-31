ALTER TABLE agent_task_queue DROP COLUMN IF EXISTS trigger_chat_message_id;

ALTER TABLE chat_message
    DROP COLUMN IF EXISTS mentioned_agent_ids,
    DROP COLUMN IF EXISTS sender_agent_id,
    DROP COLUMN IF EXISTS sender_user_id;

DROP TABLE IF EXISTS chat_session_participant;

DELETE FROM chat_session WHERE agent_id IS NULL;
ALTER TABLE chat_session ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE chat_session DROP COLUMN IF EXISTS kind;
