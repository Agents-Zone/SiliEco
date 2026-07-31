import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@silieco/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enOnboarding from "../../locales/en/onboarding.json";
import { StepWelcome } from "./step-welcome";

const TEST_RESOURCES = {
  en: { common: enCommon, onboarding: enOnboarding },
};

function renderStep({
  isWeb = false,
  onSkip,
}: {
  isWeb?: boolean;
  onSkip?: () => void;
} = {}) {
  const onNext = vi.fn();
  render(
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      <StepWelcome onNext={onNext} onSkip={onSkip} isWeb={isWeb} />
    </I18nProvider>,
  );
  return { onNext };
}

describe("StepWelcome", () => {
  it("introduces the Space, Workflow, Stage, Task, and SOP operating model", () => {
    renderStep();

    expect(
      screen.getByRole("heading", { name: /one space,from sop to execution/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Product delivery SOP")).toBeInTheDocument();
    expect(screen.getByText("Execute Tasks")).toBeInTheDocument();
    expect(screen.getByText("Current Stage")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Collaboration model for Space, Workflow, Stage, and Task",
      ),
    ).toBeInTheDocument();
  });

  it("continues the desktop onboarding flow", async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep();

    await user.click(screen.getByRole("button", { name: "Start exploring" }));

    expect(onNext).toHaveBeenCalledOnce();
  });

  it("keeps the web download and continue actions available", async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep({ isWeb: true });

    expect(screen.getByRole("link", { name: "Download Desktop" })).toHaveAttribute(
      "href",
      "/download",
    );
    await user.click(screen.getByRole("button", { name: "Continue on web" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
