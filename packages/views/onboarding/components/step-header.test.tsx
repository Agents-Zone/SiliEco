import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render as rtlRender, screen, type RenderOptions } from "@testing-library/react";
import { ONBOARDING_STEP_ORDER } from "@silieco/core/onboarding";
import { I18nProvider } from "@silieco/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enOnboarding from "../../locales/en/onboarding.json";
import { StepHeader } from "./step-header";

const TEST_RESOURCES = {
  en: { common: enCommon, onboarding: enOnboarding },
};

function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      {children}
    </I18nProvider>
  );
}

function render(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, { wrapper: I18nWrapper, ...options });
}

describe("StepHeader", () => {
  it("renders one segment per step in ONBOARDING_STEP_ORDER", () => {
    const { container } = render(<StepHeader currentStep="runtime" />);
    const segments = container.querySelectorAll("[data-onboarding-step]");
    expect(segments).toHaveLength(ONBOARDING_STEP_ORDER.length);
  });

  it("shows 'Step N of M' text matching the current step's position", () => {
    // workspace is index 1 (after runtime) → Step 2.
    render(<StepHeader currentStep="workspace" />);
    expect(
      screen.getByText(`Step 2 of ${ONBOARDING_STEP_ORDER.length}`),
    ).toBeInTheDocument();
  });

  it("sets accessible progressbar attrs", () => {
    render(<StepHeader currentStep="runtime" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "1"); // runtime is index 0 → step 1
    expect(bar).toHaveAttribute("aria-valuemax", String(ONBOARDING_STEP_ORDER.length));
  });

  it("falls back to step 1 when given an unknown step", () => {
    // TS would normally prevent this, but at runtime the store enum and
    // the flow's local step could drift during a refactor — the header
    // must not crash. Assert the defensive fallback lands on step 1.
    render(<StepHeader currentStep={"bogus" as never} />);
    expect(
      screen.getByText(`Step 1 of ${ONBOARDING_STEP_ORDER.length}`),
    ).toBeInTheDocument();
  });
});
