import type { Metadata } from "next";
import { SiliecoLanding } from "@/features/landing/components/silieco-landing";

export const metadata: Metadata = {
  title: "Silieco — Open Agent Work OS",
  description:
    "One open workspace for planning work, coordinating agents, and executing through infrastructure you own.",
  openGraph: {
    title: "Silieco — Open Agent Work OS",
    description:
      "Plan in the App, coordinate in Core, and execute through the Daemon.",
    url: "/homepage",
  },
  alternates: {
    canonical: "/homepage",
  },
};

export default function HomepagePage() {
  return <SiliecoLanding />;
}
