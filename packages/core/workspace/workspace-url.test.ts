import { describe, expect, it } from "vitest";
import { workspaceUrlHost } from "./workspace-url";

describe("workspaceUrlHost", () => {
  it("returns the host of a full app URL", () => {
    expect(workspaceUrlHost("https://silieco.example.com")).toBe(
      "silieco.example.com",
    );
  });

  it("ignores scheme, path, and trailing slash", () => {
    expect(workspaceUrlHost("https://silieco.example.com/")).toBe(
      "silieco.example.com",
    );
    expect(workspaceUrlHost("http://silieco.example.com/app/onboarding")).toBe(
      "silieco.example.com",
    );
  });

  it("preserves a non-default port", () => {
    expect(workspaceUrlHost("https://my.host:3000")).toBe("my.host:3000");
  });

  it("accepts a bare host without a scheme", () => {
    expect(workspaceUrlHost("silieco.example.com")).toBe("silieco.example.com");
    expect(workspaceUrlHost("silieco.example.com/path")).toBe(
      "silieco.example.com",
    );
  });

  it("falls back to the brand host when no app URL is configured", () => {
    expect(workspaceUrlHost("")).toBe("silieco.ai");
    expect(workspaceUrlHost("   ")).toBe("silieco.ai");
    expect(workspaceUrlHost(null)).toBe("silieco.ai");
    expect(workspaceUrlHost(undefined)).toBe("silieco.ai");
  });
});
