import { describe, expect, it } from "vitest";
import {
  encodeIssueWindowArgument,
  parseIssueWindowPath,
  parseIssueWindowRequest,
  readDesktopWindowContext,
} from "./issue-window";

describe("issue window request", () => {
  it("accepts and canonicalizes a workspace-scoped issue detail path", () => {
    expect(
      parseIssueWindowRequest({
        path: "/acme/tasks/issue-123?comment=comment-1#activity",
        title: "  SILI-1: Fix tabs  ",
      }),
    ).toEqual({
      kind: "issue",
      path: "/acme/tasks/issue-123?comment=comment-1#activity",
      title: "SILI-1: Fix tabs",
      workspaceSlug: "acme",
      issueId: "issue-123",
    });
  });

  it.each([
    "/acme/tasks",
    "/acme/projects/project-1",
    "/acme/tasks/issue-1/attachments",
    "https://example.com/acme/tasks/issue-1",
    "//example.com/acme/tasks/issue-1",
    "/acme/tasks/issue%2F1",
    "/UPPERCASE/tasks/issue-1",
  ])("rejects non-issue or unsafe paths: %s", (path) => {
    expect(parseIssueWindowPath(path)).toBeNull();
  });

  it("uses a safe fallback title and bounds renderer-controlled titles", () => {
    expect(
      parseIssueWindowRequest({ path: "/acme/tasks/issue-1", title: "  " }),
    ).toMatchObject({ title: "Task" });
    expect(
      parseIssueWindowRequest({
        path: "/acme/tasks/issue-1",
        title: "x".repeat(400),
      })?.title,
    ).toHaveLength(256);
  });

  it("round-trips a validated request through Electron additionalArguments", () => {
    const argument = encodeIssueWindowArgument({
      path: "/acme/tasks/issue-1",
      title: "SILI-1: Fix tabs",
    });

    expect(readDesktopWindowContext(["electron", argument])).toEqual({
      kind: "issue",
      path: "/acme/tasks/issue-1",
      title: "SILI-1: Fix tabs",
      workspaceSlug: "acme",
      issueId: "issue-1",
    });
  });

  it("falls back to the main window for malformed launch arguments", () => {
    expect(
      readDesktopWindowContext(["electron", "--silieco-issue-window=%7Bbad"]),
    ).toEqual({ kind: "main" });
  });
});
