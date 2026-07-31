"use client";

import { IssuesPage } from "@silieco/views/issues/components";
import { ErrorBoundary } from "@silieco/ui/components/common/error-boundary";

export default function TasksPage() {
  return (
    <ErrorBoundary>
      <IssuesPage />
    </ErrorBoundary>
  );
}
