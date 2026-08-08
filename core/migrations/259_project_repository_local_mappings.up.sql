UPDATE project_resource AS repository
SET resource_ref = jsonb_set(repository.resource_ref, '{primary}', 'true'::jsonb, true)
WHERE repository.resource_type = 'github_repo'
  AND NOT EXISTS (
    SELECT 1
    FROM project_resource AS current_primary
    WHERE current_primary.project_id = repository.project_id
      AND current_primary.resource_type = 'github_repo'
      AND COALESCE((current_primary.resource_ref->>'primary')::boolean, false)
  )
  AND repository.id = (
    SELECT candidate.id
    FROM project_resource AS candidate
    WHERE candidate.project_id = repository.project_id
      AND candidate.resource_type = 'github_repo'
    ORDER BY candidate.position, candidate.created_at, candidate.id
    LIMIT 1
  );

UPDATE project_resource AS local_mapping
SET resource_ref = jsonb_set(
  local_mapping.resource_ref,
  '{repository_resource_id}',
  to_jsonb((
    SELECT repository.id::text
    FROM project_resource AS repository
    WHERE repository.project_id = local_mapping.project_id
      AND repository.resource_type = 'github_repo'
    ORDER BY
      COALESCE((repository.resource_ref->>'primary')::boolean, false) DESC,
      repository.position,
      repository.created_at,
      repository.id
    LIMIT 1
  )),
  true
)
WHERE local_mapping.resource_type = 'local_directory'
  AND NULLIF(local_mapping.resource_ref->>'repository_resource_id', '') IS NULL
  AND EXISTS (
    SELECT 1
    FROM project_resource AS repository
    WHERE repository.project_id = local_mapping.project_id
      AND repository.resource_type = 'github_repo'
  );
