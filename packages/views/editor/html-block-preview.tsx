"use client";

/**
 * HtmlBlockPreview — readonly rendering of fenced ```html code blocks.
 *
 * Default view is "preview" (iframe) per the V2 plan; user can flip to
 * "source" to see the highlighted markup and Copy it. Maximize opens the
 * same iframe in a full-screen Dialog.
 *
 * Mounted by ReadonlyContent's `code` renderer for `lang === "html"`. The
 * `pre` renderer in ReadonlyContent recognizes this component by reference
 * and unwraps it from the default `<pre>` envelope, matching the same
 * two-layer trick already used for MermaidDiagram.
 *
 * NOT used in the editable Tiptap NodeView — that path must keep
 * `<NodeViewContent as="code" />` so the user can continue typing.
 */

import { useState } from "react";
import {
  Check,
  Code as CodeIcon,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Maximize2,
} from "lucide-react";
import { useWorkspaceSlug } from "@silieco/core/paths";
import { cn } from "@silieco/ui/lib/utils";
import { copyText } from "@silieco/ui/lib/clipboard";
import {
  Dialog,
  DialogContent,
} from "@silieco/ui/components/ui/dialog";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";
import { CodeBlockStatic } from "./code-block-static";
import { HtmlPreviewBody } from "./html-preview-body";
import {
  downloadInlineHtml,
  openInlineHtmlInBrowserTab,
  registerInlineHtmlPreview,
} from "./inline-html-preview";

const CODE_BLOCK_IFRAME_HEIGHT = "h-[480px]";

/**
 * Pixel twin of CODE_BLOCK_IFRAME_HEIGHT. The preview iframe is a fixed height,
 * so the near-viewport lazy shell (rich-content/lazy-rich-block.tsx) can
 * reserve exactly the space this component will occupy and mount with zero
 * layout shift. Keep the two in sync.
 */
export const HTML_BLOCK_PREVIEW_HEIGHT_PX = 480;

// Label shown in the code-block header. Not a translatable string — it's a
// language identifier (matches the `lang === "html"` token below).
const HTML_LANGUAGE_LABEL = "html";

interface HtmlBlockPreviewProps {
  html: string;
  className?: string;
}

export function HtmlBlockPreview({ html, className }: HtmlBlockPreviewProps) {
  const { t } = useT("editor");
  const navigation = useNavigation();
  const workspaceSlug = useWorkspaceSlug();
  const [view, setView] = useState<"preview" | "source">("preview");
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const handleCopy = async () => {
    if (!html) return;
    if (await copyText(html)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleView = () =>
    setView((v) => (v === "preview" ? "source" : "preview"));

  const handleOpenInNewTab = () => {
    if (navigation.openInNewTab && workspaceSlug) {
      const previewId = registerInlineHtmlPreview(html);
      navigation.openInNewTab(
        `/${workspaceSlug}/html-previews/${previewId}`,
        "HTML Preview",
        { activate: true },
      );
      return;
    }
    openInlineHtmlInBrowserTab(html);
  };

  return (
    <div className={cn("code-block-wrapper group/code relative my-3", className)}>
      <div
        className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/95 p-0.5 shadow-sm backdrop-blur-sm"
        data-testid="html-block-preview-actions"
      >
        {view === "preview" && (
          <>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t(($) => $.attachment.preview)}
              aria-label={t(($) => $.attachment.preview)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t(($) => $.attachment.open_in_new_tab)}
              aria-label={t(($) => $.attachment.open_in_new_tab)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => downloadInlineHtml(html)}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t(($) => $.image.download)}
              aria-label={t(($) => $.image.download)}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          </>
        )}
        <span className="sr-only">{HTML_LANGUAGE_LABEL}</span>
        <button
          type="button"
          onClick={toggleView}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={
            view === "preview"
              ? t(($) => $.code_block.show_source)
              : t(($) => $.code_block.show_preview)
          }
          aria-label={
            view === "preview"
              ? t(($) => $.code_block.show_source)
              : t(($) => $.code_block.show_preview)
          }
        >
          {view === "preview" ? (
            <CodeIcon className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={t(($) => $.code_block.copy_code)}
          aria-label={t(($) => $.code_block.copy_code)}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {view === "preview" ? (
        <HtmlPreviewBody
          source={{ kind: "inline", html }}
          title="HTML preview"
          className={CODE_BLOCK_IFRAME_HEIGHT}
        />
      ) : (
        <CodeBlockStatic language="xml" body={html} />
      )}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          className="!max-w-6xl !h-[min(90vh,calc(100vh-2rem))] w-full p-0 gap-0 overflow-hidden"
          aria-label={t(($) => $.code_block.fullscreen)}
        >
          <HtmlPreviewBody
            source={{ kind: "inline", html }}
            title="HTML preview"
            className="h-full w-full"
            iframeClassName="rounded-none border-0"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
