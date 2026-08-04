-- name: CreateAttachmentReference :one
INSERT INTO attachment_reference (
    workspace_id, attachment_id, target_type, target_id, created_by
) VALUES (
    sqlc.arg(workspace_id), sqlc.arg(attachment_id), sqlc.arg(target_type),
    sqlc.arg(target_id), sqlc.arg(created_by)
)
ON CONFLICT (workspace_id, attachment_id, target_type, target_id)
DO UPDATE SET attachment_id = EXCLUDED.attachment_id
RETURNING *;

-- name: DeleteAttachmentReference :execrows
DELETE FROM attachment_reference
WHERE workspace_id = sqlc.arg(workspace_id)
  AND attachment_id = sqlc.arg(attachment_id)
  AND target_type = sqlc.arg(target_type)
  AND target_id = sqlc.arg(target_id);

-- name: ListAttachmentReferences :many
SELECT * FROM attachment_reference
WHERE workspace_id = sqlc.arg(workspace_id)
  AND attachment_id = sqlc.arg(attachment_id)
ORDER BY created_at ASC;

-- name: ListAttachmentReferencesByTarget :many
SELECT * FROM attachment_reference
WHERE workspace_id = sqlc.arg(workspace_id)
  AND target_type = sqlc.arg(target_type)
  AND target_id = sqlc.arg(target_id)
ORDER BY created_at ASC;

-- name: ListWorkspaceAttachmentReferences :many
SELECT
    ar.*,
    COALESCE(target_issue.title, target_project.title, '') AS target_title,
    target_issue.number AS target_issue_number,
    COALESCE(target_issue.project_id, target_project.id) AS target_project_id,
    COALESCE(issue_project.title, target_project.title, '') AS target_project_title
FROM attachment_reference ar
LEFT JOIN issue target_issue
    ON ar.target_type = 'issue'
   AND target_issue.id = ar.target_id
   AND target_issue.workspace_id = ar.workspace_id
LEFT JOIN project target_project
    ON ar.target_type = 'project'
   AND target_project.id = ar.target_id
   AND target_project.workspace_id = ar.workspace_id
LEFT JOIN project issue_project
    ON issue_project.id = target_issue.project_id
   AND issue_project.workspace_id = ar.workspace_id
WHERE ar.workspace_id = sqlc.arg(workspace_id)
ORDER BY ar.created_at ASC;

-- name: CountAttachmentReferences :one
SELECT count(*) FROM attachment_reference
WHERE workspace_id = sqlc.arg(workspace_id)
  AND attachment_id = sqlc.arg(attachment_id);

-- name: DeleteAttachmentReferencesByTarget :exec
DELETE FROM attachment_reference
WHERE workspace_id = sqlc.arg(workspace_id)
  AND target_type = sqlc.arg(target_type)
  AND target_id = sqlc.arg(target_id);

-- name: DeleteAttachmentReferencesByWorkspace :exec
DELETE FROM attachment_reference
WHERE workspace_id = sqlc.arg(workspace_id);

-- name: DetachReferencedAttachmentsFromIssue :many
UPDATE attachment AS a
SET issue_id = NULL,
    comment_id = NULL
WHERE a.workspace_id = sqlc.arg(workspace_id)
  AND (
      a.issue_id = sqlc.arg(issue_id)
      OR a.comment_id IN (
          SELECT c.id
          FROM comment c
          JOIN issue ci ON ci.id = c.issue_id
          WHERE ci.workspace_id = a.workspace_id
            AND c.issue_id = sqlc.arg(issue_id)
      )
  )
  AND EXISTS (
      SELECT 1 FROM attachment_reference ar
      WHERE ar.workspace_id = a.workspace_id
        AND ar.attachment_id = a.id
  )
RETURNING id;

-- name: DetachReferencedAttachmentsFromComment :many
UPDATE attachment AS a
SET comment_id = NULL,
    issue_id = NULL
WHERE a.workspace_id = sqlc.arg(workspace_id)
  AND a.comment_id = sqlc.arg(comment_id)
  AND EXISTS (
      SELECT 1 FROM attachment_reference ar
      WHERE ar.workspace_id = a.workspace_id
        AND ar.attachment_id = a.id
  )
RETURNING id;

-- name: ListWorkspaceFileResources :many
WITH candidates AS (
    SELECT a.id
    FROM attachment a
    WHERE a.workspace_id = sqlc.arg(workspace_id)
      AND a.issue_id IS NOT NULL
      AND a.chat_session_id IS NULL
      AND a.chat_message_id IS NULL
    UNION
    SELECT ar.attachment_id
    FROM attachment_reference ar
    WHERE ar.workspace_id = sqlc.arg(workspace_id)
)
SELECT
    a.*,
    i.title AS source_issue_title,
    i.number AS source_issue_number,
    i.project_id AS source_project_id,
    p.title AS source_project_title,
    (SELECT count(*) FROM attachment_reference ar
     WHERE ar.workspace_id = a.workspace_id AND ar.attachment_id = a.id) AS reference_count
FROM candidates c
JOIN attachment a ON a.id = c.id AND a.workspace_id = sqlc.arg(workspace_id)
LEFT JOIN issue i ON i.id = a.issue_id AND i.workspace_id = a.workspace_id
LEFT JOIN project p ON p.id = i.project_id AND p.workspace_id = a.workspace_id
WHERE a.chat_session_id IS NULL
  AND a.chat_message_id IS NULL
ORDER BY a.created_at DESC, a.id DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountWorkspaceFileResources :one
SELECT count(DISTINCT a.id)
FROM attachment a
WHERE a.workspace_id = sqlc.arg(workspace_id)
  AND a.chat_session_id IS NULL
  AND a.chat_message_id IS NULL
  AND (
      a.issue_id IS NOT NULL
      OR EXISTS (
          SELECT 1 FROM attachment_reference ar
          WHERE ar.workspace_id = a.workspace_id AND ar.attachment_id = a.id
      )
  );

-- name: ListProjectFileResources :many
WITH candidates AS (
    SELECT a.id
    FROM attachment a
    JOIN issue i ON i.id = a.issue_id AND i.workspace_id = a.workspace_id
    WHERE a.workspace_id = sqlc.arg(workspace_id)
      AND i.project_id = sqlc.arg(project_id)
      AND a.chat_session_id IS NULL
      AND a.chat_message_id IS NULL
    UNION
    SELECT ar.attachment_id
    FROM attachment_reference ar
    WHERE ar.workspace_id = sqlc.arg(workspace_id)
      AND (
          (ar.target_type = 'project' AND ar.target_id = sqlc.arg(project_id))
          OR (ar.target_type = 'issue' AND EXISTS (
              SELECT 1 FROM issue target_issue
              WHERE target_issue.id = ar.target_id
                AND target_issue.workspace_id = ar.workspace_id
                AND target_issue.project_id = sqlc.arg(project_id)
          ))
      )
)
SELECT
    a.*,
    i.title AS source_issue_title,
    i.number AS source_issue_number,
    i.project_id AS source_project_id,
    p.title AS source_project_title,
    (SELECT count(*) FROM attachment_reference ar
     WHERE ar.workspace_id = a.workspace_id AND ar.attachment_id = a.id) AS reference_count
FROM candidates c
JOIN attachment a ON a.id = c.id AND a.workspace_id = sqlc.arg(workspace_id)
LEFT JOIN issue i ON i.id = a.issue_id AND i.workspace_id = a.workspace_id
LEFT JOIN project p ON p.id = i.project_id AND p.workspace_id = a.workspace_id
WHERE a.chat_session_id IS NULL
  AND a.chat_message_id IS NULL
ORDER BY a.created_at DESC, a.id DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountProjectFileResources :one
SELECT count(DISTINCT a.id)
FROM attachment a
WHERE a.workspace_id = sqlc.arg(workspace_id)
  AND a.chat_session_id IS NULL
  AND a.chat_message_id IS NULL
  AND (
      EXISTS (
          SELECT 1 FROM issue source_issue
          WHERE source_issue.id = a.issue_id
            AND source_issue.workspace_id = a.workspace_id
            AND source_issue.project_id = sqlc.arg(project_id)
      )
      OR EXISTS (
          SELECT 1 FROM attachment_reference ar
          WHERE ar.workspace_id = a.workspace_id
            AND ar.attachment_id = a.id
            AND (
                (ar.target_type = 'project' AND ar.target_id = sqlc.arg(project_id))
                OR (ar.target_type = 'issue' AND EXISTS (
                    SELECT 1 FROM issue target_issue
                    WHERE target_issue.id = ar.target_id
                      AND target_issue.workspace_id = ar.workspace_id
                      AND target_issue.project_id = sqlc.arg(project_id)
                ))
            )
      )
  );
