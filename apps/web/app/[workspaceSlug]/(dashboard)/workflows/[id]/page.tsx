"use client";

import { use } from "react";
import { WorkflowsPage } from "@silieco/views/workflows/components";

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <WorkflowsPage workflowId={id} />;
}
