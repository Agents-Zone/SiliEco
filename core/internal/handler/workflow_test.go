package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func workflowRequest(method, path string, body any, params map[string]string) *http.Request {
	req := newRequest(method, path, body)
	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func cleanupWorkflowTestData(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		testPool.Exec(ctx, `UPDATE issue SET workflow_instance_id = NULL, workflow_stage_id = NULL WHERE workspace_id = $1`, testWorkspaceID)
		testPool.Exec(ctx, `DELETE FROM workflow_gate_decision WHERE workspace_id = $1`, testWorkspaceID)
		testPool.Exec(ctx, `DELETE FROM workflow_instance WHERE workspace_id = $1`, testWorkspaceID)
		testPool.Exec(ctx, `DELETE FROM workflow_stage WHERE workspace_id = $1`, testWorkspaceID)
		testPool.Exec(ctx, `DELETE FROM workflow_version WHERE workspace_id = $1`, testWorkspaceID)
		testPool.Exec(ctx, `DELETE FROM workflow WHERE workspace_id = $1`, testWorkspaceID)
	})
}

func TestNormalizeWorkflowStagesValidatesRollbackAndGate(t *testing.T) {
	stages, err := normalizeWorkflowStages([]WorkflowStageInput{
		{Name: "Plan"},
		{
			Name:             "Review",
			Gate:             json.RawMessage(`{"type":"human"}`),
			RollbackStageKey: stringPtr("stage_1"),
		},
	})
	if err != nil {
		t.Fatalf("expected valid stages: %v", err)
	}
	if stages[0].StableKey != "stage_1" || stages[1].StableKey != "stage_2" {
		t.Fatalf("unexpected generated stable keys: %#v", stages)
	}

	_, err = normalizeWorkflowStages([]WorkflowStageInput{
		{Name: "Plan"},
		{Name: "Review", Gate: json.RawMessage(`{"type":"unknown"}`)},
	})
	if err == nil {
		t.Fatal("expected unknown gate type to be rejected")
	}

	_, err = normalizeWorkflowStages([]WorkflowStageInput{
		{Name: "Plan", RollbackStageKey: stringPtr("stage_2")},
		{Name: "Review"},
	})
	if err == nil {
		t.Fatal("expected forward rollback target to be rejected")
	}
}

func TestValidateWorkflowGateActorUsesConfiguredDecider(t *testing.T) {
	gate := workflowGateConfig{
		Type:         "human",
		Decider:      "member-1",
		HumanDecider: "member-1",
	}
	if err := validateWorkflowGateActor(gate, "member", "member-1"); err != nil {
		t.Fatalf("configured member should be allowed: %v", err)
	}
	if err := validateWorkflowGateActor(gate, "member", "member-2"); err == nil {
		t.Fatal("a different member must not be allowed through a specific human gate")
	}
	if err := validateWorkflowGateActor(workflowGateConfig{
		Type: "agent", Decider: "agent-1",
	}, "agent", "agent-2"); err == nil {
		t.Fatal("a different agent must not be allowed through a specific agent gate")
	}
}

func TestWorkflowLifecycleKeepsTaskStatusAndStageIndependent(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	cleanupWorkflowTestData(t)

	var projectID string
	if err := testPool.QueryRow(context.Background(), `
		INSERT INTO project (workspace_id, title)
		VALUES ($1, 'Release project')
		RETURNING id
	`, testWorkspaceID).Scan(&projectID); err != nil {
		t.Fatalf("create project: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM project WHERE id = $1`, projectID)
	})
	var otherProjectID string
	if err := testPool.QueryRow(context.Background(), `
		INSERT INTO project (workspace_id, title)
		VALUES ($1, 'Other project')
		RETURNING id
	`, testWorkspaceID).Scan(&otherProjectID); err != nil {
		t.Fatalf("create other project: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM project WHERE id = $1`, otherProjectID)
	})

	create := httptest.NewRecorder()
	testHandler.CreateWorkflow(create, newRequest(http.MethodPost, "/api/workflows", map[string]any{
		"name":       "Release SOP",
		"project_id": projectID,
		"publish":    true,
		"stages": []map[string]any{
			{"name": "Build"},
			{"name": "Approve", "gate": map[string]any{"type": "human"}, "rollback_stage_key": "stage_1"},
		},
	}))
	if create.Code != http.StatusCreated {
		t.Fatalf("create workflow: status=%d body=%s", create.Code, create.Body.String())
	}
	var workflow WorkflowResponse
	if err := json.Unmarshal(create.Body.Bytes(), &workflow); err != nil {
		t.Fatalf("decode workflow: %v", err)
	}
	if workflow.CurrentVersion == nil || len(workflow.CurrentVersion.Stages) != 2 {
		t.Fatalf("expected published two-stage workflow: %#v", workflow)
	}

	var taskID string
	if err := testPool.QueryRow(context.Background(), `
		INSERT INTO issue (
			workspace_id, title, status, priority, creator_type, creator_id,
			position, number
		)
		VALUES (
			$1, 'Ship release', 'todo', 'none', 'member', $2,
			0, (SELECT issue_counter + 1000 FROM workspace WHERE id = $1)
		)
		RETURNING id
	`, testWorkspaceID, testUserID).Scan(&taskID); err != nil {
		t.Fatalf("create task: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, taskID)
	})

	mismatchedInstance := httptest.NewRecorder()
	testHandler.CreateWorkflowInstance(
		mismatchedInstance,
		workflowRequest(http.MethodPost, "/api/workflows/"+workflow.ID+"/instances", map[string]any{
			"title":      "Wrong project",
			"project_id": otherProjectID,
			"start":      true,
		}, map[string]string{"id": workflow.ID}),
	)
	if mismatchedInstance.Code != http.StatusBadRequest {
		t.Fatalf("expected mismatched run project to be rejected, got %d: %s", mismatchedInstance.Code, mismatchedInstance.Body.String())
	}

	createInstance := httptest.NewRecorder()
	testHandler.CreateWorkflowInstance(
		createInstance,
		workflowRequest(http.MethodPost, "/api/workflows/"+workflow.ID+"/instances", map[string]any{
			"title": "Release 1.0",
			"start": true,
		}, map[string]string{"id": workflow.ID}),
	)
	if createInstance.Code != http.StatusCreated {
		t.Fatalf("create instance: status=%d body=%s", createInstance.Code, createInstance.Body.String())
	}
	var instance WorkflowInstanceResponse
	if err := json.Unmarshal(createInstance.Body.Bytes(), &instance); err != nil {
		t.Fatalf("decode instance: %v", err)
	}
	firstStage := workflow.CurrentVersion.Stages[0]
	secondStage := workflow.CurrentVersion.Stages[1]
	if instance.CurrentStageID == nil || *instance.CurrentStageID != firstStage.ID {
		t.Fatalf("expected instance to start at first stage: %#v", instance)
	}
	if instance.ProjectID == nil || *instance.ProjectID != projectID {
		t.Fatalf("run must inherit the SOP project: %#v", instance)
	}

	emptyRunRecorder := httptest.NewRecorder()
	testHandler.CreateWorkflowInstance(
		emptyRunRecorder,
		workflowRequest(http.MethodPost, "/api/workflows/"+workflow.ID+"/instances", map[string]any{
			"title": "Unused release run",
			"start": true,
		}, map[string]string{"id": workflow.ID}),
	)
	if emptyRunRecorder.Code != http.StatusCreated {
		t.Fatalf("create empty run: status=%d body=%s", emptyRunRecorder.Code, emptyRunRecorder.Body.String())
	}
	var emptyRun WorkflowInstanceResponse
	if err := json.Unmarshal(emptyRunRecorder.Body.Bytes(), &emptyRun); err != nil {
		t.Fatalf("decode empty run: %v", err)
	}
	archiveEmpty := httptest.NewRecorder()
	testHandler.ArchiveWorkflowInstance(
		archiveEmpty,
		workflowRequest(http.MethodPost, "/api/workflow-instances/"+emptyRun.ID+"/archive", nil, map[string]string{"id": emptyRun.ID}),
	)
	if archiveEmpty.Code != http.StatusOK {
		t.Fatalf("archive empty run: status=%d body=%s", archiveEmpty.Code, archiveEmpty.Body.String())
	}
	var archivedRun WorkflowInstanceResponse
	if err := json.Unmarshal(archiveEmpty.Body.Bytes(), &archivedRun); err != nil {
		t.Fatalf("decode archived run: %v", err)
	}
	if archivedRun.ArchivedAt == nil || archivedRun.ArchivedBy == nil || archivedRun.TaskCount != 0 {
		t.Fatalf("archive audit fields missing: %#v", archivedRun)
	}

	attach := httptest.NewRecorder()
	testHandler.AttachWorkflowTask(
		attach,
		workflowRequest(http.MethodPut, "/api/workflow-instances/"+instance.ID+"/tasks/"+taskID, map[string]any{
			"stage_id": firstStage.ID,
		}, map[string]string{"id": instance.ID, "taskId": taskID}),
	)
	if attach.Code != http.StatusOK {
		t.Fatalf("attach task: status=%d body=%s", attach.Code, attach.Body.String())
	}
	archiveWithTask := httptest.NewRecorder()
	testHandler.ArchiveWorkflowInstance(
		archiveWithTask,
		workflowRequest(http.MethodPost, "/api/workflow-instances/"+instance.ID+"/archive", nil, map[string]string{"id": instance.ID}),
	)
	if archiveWithTask.Code != http.StatusConflict {
		t.Fatalf("run with Task must not be archived, got %d: %s", archiveWithTask.Code, archiveWithTask.Body.String())
	}
	var attached IssueResponse
	if err := json.Unmarshal(attach.Body.Bytes(), &attached); err != nil {
		t.Fatalf("decode attached task: %v", err)
	}
	if attached.ProjectID == nil || *attached.ProjectID != projectID {
		t.Fatalf("Space-level Task must inherit the run project when attached: %#v", attached)
	}
	listRuns := httptest.NewRecorder()
	testHandler.ListWorkflowInstances(
		listRuns,
		newRequest(http.MethodGet, "/api/workflow-instances?project_id="+projectID, nil),
	)
	if listRuns.Code != http.StatusOK {
		t.Fatalf("list workflow runs: status=%d body=%s", listRuns.Code, listRuns.Body.String())
	}
	var listed struct {
		Instances []WorkflowInstanceResponse `json:"instances"`
	}
	if err := json.Unmarshal(listRuns.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode workflow run list: %v", err)
	}
	listedTaskCount := int64(-1)
	for _, listedRun := range listed.Instances {
		if listedRun.ID == instance.ID {
			listedTaskCount = listedRun.TaskCount
			break
		}
	}
	if listedTaskCount != 1 {
		t.Fatalf("workflow run list must report one linked Task, got %d: %s", listedTaskCount, listRuns.Body.String())
	}

	blocked := httptest.NewRecorder()
	testHandler.TransitionWorkflowInstance(
		blocked,
		workflowRequest(http.MethodPost, "/api/workflow-instances/"+instance.ID+"/transition", map[string]any{
			"outcome": "approved",
		}, map[string]string{"id": instance.ID}),
	)
	if blocked.Code != http.StatusConflict {
		t.Fatalf("expected open task to block transition, got %d: %s", blocked.Code, blocked.Body.String())
	}

	if _, err := testPool.Exec(context.Background(), `UPDATE issue SET status = 'done' WHERE id = $1`, taskID); err != nil {
		t.Fatalf("complete task: %v", err)
	}
	advance := httptest.NewRecorder()
	testHandler.TransitionWorkflowInstance(
		advance,
		workflowRequest(http.MethodPost, "/api/workflow-instances/"+instance.ID+"/transition", map[string]any{
			"outcome": "approved",
		}, map[string]string{"id": instance.ID}),
	)
	if advance.Code != http.StatusOK {
		t.Fatalf("advance workflow: status=%d body=%s", advance.Code, advance.Body.String())
	}

	move := httptest.NewRecorder()
	testHandler.AttachWorkflowTask(
		move,
		workflowRequest(http.MethodPut, "/api/workflow-instances/"+instance.ID+"/tasks/"+taskID, map[string]any{
			"stage_id": secondStage.ID,
		}, map[string]string{"id": instance.ID, "taskId": taskID}),
	)
	if move.Code != http.StatusOK {
		t.Fatalf("move task: status=%d body=%s", move.Code, move.Body.String())
	}
	var moved IssueResponse
	if err := json.Unmarshal(move.Body.Bytes(), &moved); err != nil {
		t.Fatalf("decode moved task: %v", err)
	}
	if moved.Status != "done" || moved.WorkflowStageID == nil || *moved.WorkflowStageID != secondStage.ID {
		t.Fatalf("stage move must preserve task status: %#v", moved)
	}

	complete := httptest.NewRecorder()
	testHandler.TransitionWorkflowInstance(
		complete,
		workflowRequest(http.MethodPost, "/api/workflow-instances/"+instance.ID+"/transition", map[string]any{
			"outcome": "approved",
			"note":    "Human release approval",
		}, map[string]string{"id": instance.ID}),
	)
	if complete.Code != http.StatusOK {
		t.Fatalf("complete workflow: status=%d body=%s", complete.Code, complete.Body.String())
	}
	var completed WorkflowInstanceResponse
	if err := json.Unmarshal(complete.Body.Bytes(), &completed); err != nil {
		t.Fatalf("decode completed instance: %v", err)
	}
	if completed.Status != "completed" {
		t.Fatalf("expected completed instance, got %q", completed.Status)
	}

	var decisionCount int
	if err := testPool.QueryRow(context.Background(), `
		SELECT count(*) FROM workflow_gate_decision
		WHERE workflow_instance_id = $1
	`, instance.ID).Scan(&decisionCount); err != nil {
		t.Fatalf("count gate decisions: %v", err)
	}
	if decisionCount != 1 {
		t.Fatalf("expected one human gate decision, got %d", decisionCount)
	}
}

func TestSpaceWorkflowCanRunInsideAProject(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	cleanupWorkflowTestData(t)

	var projectID string
	if err := testPool.QueryRow(context.Background(), `
		INSERT INTO project (workspace_id, title)
		VALUES ($1, 'Space SOP target')
		RETURNING id
	`, testWorkspaceID).Scan(&projectID); err != nil {
		t.Fatalf("create project: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM project WHERE id = $1`, projectID)
	})

	create := httptest.NewRecorder()
	testHandler.CreateWorkflow(create, newRequest(http.MethodPost, "/api/workflows", map[string]any{
		"name":    "Space release SOP",
		"publish": true,
		"stages": []map[string]any{
			{
				"name": "Delivery",
				"completion_rule": map[string]any{
					"type":            "all_tasks_terminal",
					"evaluation_mode": "on_task_change",
				},
			},
		},
	}))
	if create.Code != http.StatusCreated {
		t.Fatalf("create Space workflow: status=%d body=%s", create.Code, create.Body.String())
	}
	var workflow WorkflowResponse
	if err := json.Unmarshal(create.Body.Bytes(), &workflow); err != nil {
		t.Fatalf("decode Space workflow: %v", err)
	}
	if workflow.ProjectID != nil {
		t.Fatalf("Space workflow must not be pinned to a project: %#v", workflow)
	}

	missingProject := httptest.NewRecorder()
	testHandler.CreateWorkflowInstance(
		missingProject,
		workflowRequest(http.MethodPost, "/api/workflows/"+workflow.ID+"/instances", map[string]any{
			"title": "Missing target",
			"start": true,
		}, map[string]string{"id": workflow.ID}),
	)
	if missingProject.Code != http.StatusBadRequest {
		t.Fatalf("expected Space workflow run without project to fail, got %d: %s", missingProject.Code, missingProject.Body.String())
	}

	createRun := httptest.NewRecorder()
	testHandler.CreateWorkflowInstance(
		createRun,
		workflowRequest(http.MethodPost, "/api/workflows/"+workflow.ID+"/instances", map[string]any{
			"title":      "Project delivery",
			"project_id": projectID,
			"start":      true,
		}, map[string]string{"id": workflow.ID}),
	)
	if createRun.Code != http.StatusCreated {
		t.Fatalf("start Space workflow in project: status=%d body=%s", createRun.Code, createRun.Body.String())
	}
	var run WorkflowInstanceResponse
	if err := json.Unmarshal(createRun.Body.Bytes(), &run); err != nil {
		t.Fatalf("decode workflow run: %v", err)
	}
	if run.ProjectID == nil || *run.ProjectID != projectID {
		t.Fatalf("Space workflow run must bind to the selected project: %#v", run)
	}

	list := httptest.NewRecorder()
	testHandler.ListWorkflows(
		list,
		newRequest(http.MethodGet, "/api/workflows?project_id="+projectID, nil),
	)
	if list.Code != http.StatusOK {
		t.Fatalf("list project workflows: status=%d body=%s", list.Code, list.Body.String())
	}
	var payload struct {
		Workflows []WorkflowResponse `json:"workflows"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode workflow list: %v", err)
	}
	found := false
	for _, item := range payload.Workflows {
		if item.ID == workflow.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("Project workflow list must include reusable Space SOPs")
	}
}

func stringPtr(value string) *string { return &value }
