"use client";

import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { SystemSection } from "./system-section";
import { HowItWorksSection } from "./how-it-works-section";
import { OpenSourceSection } from "./open-source-section";
import { FAQSection } from "./faq-section";
import { LandingFooter } from "./landing-footer";

export function SiliecoLanding() {
  return (
    <>
      <div className="relative">
        <LandingHeader />
        <LandingHero />
      </div>

      <SystemSection />
      <HowItWorksSection />
      <OpenSourceSection />
      <FAQSection />
      <LandingFooter />
    </>
  );
}
