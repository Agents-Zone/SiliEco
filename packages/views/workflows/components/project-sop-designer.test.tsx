import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@silieco/core/i18n/react";
import enWorkflows from "../../locales/en/workflows.json";
import { ProjectSopDesigner } from "./project-sop-designer";

const { createInstance, createWorkflow, runs, workflows } = vi.hoisted(() => ({
  createInstance: vi.fn(),
  createWorkflow: vi.fn(),
  runs: { current: [] as unknown[] },
  workflows: { current: [] as unknown[] },
}));

vi.mock("@silieco/core/hooks", () => ({
  useWorkspaceId: () => "workspace-1",
}));

vi.mock("@silieco/core/workflows", () => ({
  workflowListOptions: () => ({ queryKey: ["workflows"] }),
  workflowInstancesOptions: () => ({ queryKey: ["workflow-runs"] }),
  useCreateWorkflow: () => ({
    isPending: false,
    mutate: createWorkflow,
  }),
  useCreateWorkflowInstance: () => ({
    isPending: false,
    mutate: createInstance,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "workflow-runs"
      ? { data: runs.current, isLoading: false }
      : { data: workflows.current, isLoading: false },
}));

function renderDesigner() {
  return render(
    <I18nProvider locale="en" resources={{ en: { workflows: enWorkflows } }}>
      <ProjectSopDesigner projectId="project-1" />
    </I18nProvider>,
  );
}

describe("ProjectSopDesigner", () => {
  beforeEach(() => {
    createInstance.mockReset();
    createWorkflow.mockReset();
    runs.current = [];
    workflows.current = [];
  });

  it("offers the prototype templates without rendering Task management", () => {
    renderDesigner();

    expect(screen.getByRole("button", { name: /投标模板/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /软件开发模板/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bug 修复模板/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /通用文档协作模板/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /空白 SOP/ })).toBeInTheDocument();
    expect(screen.queryByText("Task board")).not.toBeInTheDocument();
    expect(screen.queryByText("Start a Workflow")).not.toBeInTheDocument();
  });

  it("starts a published SOP with a distinct editable run name", () => {
    workflows.current = [
      {
        id: "workflow-1",
        name: "Release SOP",
        description: "Ship safely",
        status: "published",
        current_version: { stages: [{ id: "stage-1" }] },
      },
    ];
    renderDesigner();

    fireEvent.click(screen.getByRole("button", { name: "Start SOP" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const runName = screen.getByLabelText("Run name");
    expect(runName).toHaveValue("Release SOP · Run 1");
    fireEvent.change(runName, { target: { value: "Mobile 2.0 release" } });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));

    expect(createInstance).toHaveBeenCalledWith(
      {
        workflowId: "workflow-1",
        data: {
          title: "Mobile 2.0 release",
          project_id: "project-1",
          start: true,
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
        onSettled: expect.any(Function),
      }),
    );
  });

  it("loads the software template into a five-Stage SOP editor", () => {
    renderDesigner();

    fireEvent.click(screen.getByRole("button", { name: /软件开发模板/ }));

    expect(screen.getByDisplayValue("软件开发模板")).toBeInTheDocument();
    expect(screen.getByDisplayValue("需求设计")).toBeInTheDocument();
    expect(screen.getByDisplayValue("架构设计")).toBeInTheDocument();
    expect(screen.getByDisplayValue("开发实现")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("E2E 测试")).toHaveLength(2);
    expect(screen.getByDisplayValue("发布验收")).toBeInTheDocument();
  });

  it("publishes the selected template with Stage configuration only", () => {
    renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /软件开发模板/ }));

    fireEvent.click(screen.getByRole("button", { name: "Publish SOP" }));

    expect(createWorkflow).toHaveBeenCalledTimes(1);
    const [payload] = createWorkflow.mock.calls[0]!;
    expect(payload).toMatchObject({
      project_id: "project-1",
      name: "软件开发模板",
      publish: true,
    });
    expect(payload.stages).toHaveLength(5);
    expect(payload.stages[2]).toMatchObject({
      stable_key: "stage_3",
      name: "开发实现",
      input_spec: { default_artifact: "架构文档.md" },
      output_spec: { default_artifact: "代码 + 单元测试" },
      required_skills: ["编码", "TDD"],
      gate: {
        type: "agent",
        decider_type: "self_agent",
        decider: "@self",
      },
    });
  });

  it("shows and removes a custom Stage status", () => {
    renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /Bug 修复模板/ }));
    const customStatus = screen.getAllByPlaceholderText("Custom status, Enter")[0]!;

    fireEvent.change(customStatus, { target: { value: "QA ready" } });
    fireEvent.keyDown(customStatus, { key: "Enter" });

    const statusButton = screen.getByRole("button", { name: "QA ready" });
    expect(statusButton).toBeInTheDocument();
    fireEvent.click(statusButton);
    expect(screen.queryByRole("button", { name: "QA ready" })).not.toBeInTheDocument();
  });
});
