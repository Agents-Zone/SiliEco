CREATE INDEX CONCURRENTLY attachment_reference_attachment_idx ON attachment_reference (workspace_id, attachment_id, created_at);
