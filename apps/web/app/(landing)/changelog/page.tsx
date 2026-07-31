import type { Metadata } from "next";
import { ChangelogPageClient } from "@/features/landing/components/changelog-page-client";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "See what's new in Silieco — latest features, improvements, and fixes.",
  openGraph: {
    title: "Changelog | Silieco",
    description: "Latest updates and releases from Silieco.",
    url: "/changelog",
  },
  alternates: {
    canonical: "/changelog",
  },
};

export default function ChangelogPage() {
  return <ChangelogPageClient />;
}
