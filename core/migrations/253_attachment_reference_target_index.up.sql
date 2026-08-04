CREATE INDEX CONCURRENTLY attachment_reference_target_idx ON attachment_reference (workspace_id, target_type, target_id, created_at);
