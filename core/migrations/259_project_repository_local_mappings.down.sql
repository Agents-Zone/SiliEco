UPDATE project_resource
SET resource_ref = resource_ref - 'repository_resource_id'
WHERE resource_type = 'local_directory';

UPDATE project_resource
SET resource_ref = resource_ref - 'primary'
WHERE resource_type = 'github_repo';
