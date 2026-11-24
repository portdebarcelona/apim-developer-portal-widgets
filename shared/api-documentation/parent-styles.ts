/** Preserve the recovered full-width portal layout, with a matching cleanup. */
export function parentStyles(kind: string): () => void {
  try {
    const parent = window.parent.document;
    if (parent === document) return () => {};
    const style = parent.createElement('style');
    style.dataset.apimDocumentation = kind;
    style.textContent = `section { margin-top: 0 !important; padding: 0 !important; }
      section > div { margin-top: 0 !important; padding: 0 !important; }
      .layout-container, .apim-page-content-container, .content-container {
        max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important;
      }
      article { padding: 0 !important; }`;
    parent.head.appendChild(style);
    return () => style.remove();
  } catch { return () => {}; } // Swagger's existing sandbox denies parent DOM access.
}
