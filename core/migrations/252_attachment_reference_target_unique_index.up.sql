CREATE UNIQUE INDEX CONCURRENTLY attachment_reference_target_uidx ON attachment_reference (workspace_id, attachment_id, target_type, target_id);
