export function injectParentStyles(css: string): void {
  try {
    const parentDocument = window.parent?.document
    if (!parentDocument) {
      return
    }

    let style = parentDocument.getElementById("widget-parent-styles") as HTMLStyleElement | null

    if (!style) {
      style = parentDocument.createElement("style")
      style.id = "widget-parent-styles"
      parentDocument.head.appendChild(style)
    }

    style.textContent = css
  } catch (error) {
    console.warn("Unable to inject styles into parent (Cross-Origin blocking):", error)
  }
}
