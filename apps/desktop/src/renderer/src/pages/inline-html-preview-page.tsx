import { useParams } from "react-router-dom";
import { InlineHtmlPreviewPage } from "@silieco/views/editor";

export function InlineHtmlPreviewRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <InlineHtmlPreviewPage previewId={id} />;
}
