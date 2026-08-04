const MAX_REGISTERED_PREVIEWS = 20;
const previews = new Map<string, string>();

export function registerInlineHtmlPreview(html: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  previews.set(id, html);
  while (previews.size > MAX_REGISTERED_PREVIEWS) {
    const oldest = previews.keys().next().value as string | undefined;
    if (!oldest) break;
    previews.delete(oldest);
  }
  return id;
}

export function getInlineHtmlPreview(id: string): string | undefined {
  return previews.get(id);
}

export function openInlineHtmlInBrowserTab(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadInlineHtml(html: string, filename = "preview.html"): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
