"use client";

/**
 * AttachmentPreviewPage — full-page attachment viewer.
 *
 * Loads attachment metadata first, then delegates to the same kind dispatcher
 * as the modal preview: image, PDF, audio/video, Markdown, HTML, or text.
 *
 * The route is workspace-scoped (`/{slug}/attachments/{id}/preview`) for
 * tenancy isolation. Text-backed previews use the auth-checked `/content`
 * proxy; media previews use the attachment's resolved media URL.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@silieco/core/api";
import { useT } from "../i18n";
import { AttachmentStandalonePreview } from "../editor/attachment-preview-modal";

interface AttachmentPreviewPageProps {
  attachmentId: string;
  /** Optional display name. Falls back to a generic label and is only used
   *  for the document title — never echoed into the iframe sandbox. */
  filename?: string;
}

export function AttachmentPreviewPage({
  attachmentId,
  filename,
}: AttachmentPreviewPageProps) {
  const { t } = useT("editor");
  const query = useQuery({
    queryKey: ["attachment", attachmentId] as const,
    queryFn: () => api.getAttachment(attachmentId),
    retry: false,
  });
  const displayName = filename || query.data?.filename;

  // Set document.title so desktop's MutationObserver-based tab title picks
  // up the filename. Web shows the same string in the browser tab.
  useEffect(() => {
    if (displayName) document.title = displayName;
  }, [displayName]);

  const isLoading = query.isLoading;
  const isError = !isLoading && (!!query.error || !query.data?.id);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-body text-muted-foreground">
          {t(($) => $.attachment.preview_loading)}
        </div>
      ) : isError ? (
        <div
          className="flex flex-1 items-center justify-center px-4 text-body text-muted-foreground"
          data-testid="attachment-preview-page-error"
        >
          {t(($) => $.attachment.preview_failed)}
        </div>
      ) : query.data ? (
        <AttachmentStandalonePreview
          attachment={displayName ? { ...query.data, filename: displayName } : query.data}
        />
      ) : null}
    </div>
  );
}
