"use client";

import { useEffect } from "react";
import { useT } from "../i18n";
import { HtmlPreviewBody } from "./html-preview-body";
import { getInlineHtmlPreview } from "./inline-html-preview";

export function InlineHtmlPreviewPage({ previewId }: { previewId: string }) {
  const { t } = useT("editor");
  const html = getInlineHtmlPreview(previewId);

  useEffect(() => {
    document.title = "HTML Preview";
  }, []);

  if (html === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-body text-muted-foreground">
        {t(($) => $.attachment.inline_preview_expired)}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full bg-background">
      <HtmlPreviewBody
        source={{ kind: "inline", html }}
        title="HTML preview"
        className="h-full w-full"
        iframeClassName="rounded-none border-0"
      />
    </div>
  );
}
