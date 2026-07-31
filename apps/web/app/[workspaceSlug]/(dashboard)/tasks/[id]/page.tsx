"use client";

import { use } from "react";
import { IssueDetail } from "@silieco/views/issues/components";
import { ErrorBoundary } from "@silieco/ui/components/common/error-boundary";

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <ErrorBoundary resetKeys={[id]}>
      <IssueDetail issueId={id} />
    </ErrorBoundary>
  );
}
