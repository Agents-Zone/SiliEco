import { describe, expect, it } from "vitest";
import {
  customRuntimeDocsHref,
  daemonRuntimesDocsHref,
} from "./runtime-docs";

describe("runtime docs links", () => {
  it.each([
    ["en", "https://silieco.ai/docs/daemon-runtimes"],
    ["zh-Hans", "https://silieco.ai/docs/zh/daemon-runtimes"],
    ["ja", "https://silieco.ai/docs/ja/daemon-runtimes"],
    ["ko", "https://silieco.ai/docs/ko/daemon-runtimes"],
  ])("localizes the daemon guide for %s", (language, expected) => {
    expect(daemonRuntimesDocsHref(language)).toBe(expected);
  });

  it("adds the localized custom runtime section", () => {
    expect(customRuntimeDocsHref("zh-Hans")).toBe(
      `https://silieco.ai/docs/zh/daemon-runtimes#${encodeURIComponent("自定义运行时配置")}`,
    );
  });
});
