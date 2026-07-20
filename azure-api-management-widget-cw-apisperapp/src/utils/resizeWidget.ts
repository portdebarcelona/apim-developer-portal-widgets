function getContentHeight(): number {
  const app = document.getElementById("app-content") || document.getElementById("app") || document.getElementById("root")
  const appHeight = app ? app.scrollHeight : 0

  return Math.max(appHeight, document.body.scrollHeight, document.documentElement.scrollHeight)
}

function updateWidgetHeight(): void {
  try {
    const desiredHeight = Math.max(getContentHeight() + 50, 800)
    const frame = window.frameElement as HTMLElement | null

    if (frame) {
      const currentHeight = parseInt(frame.style.height || "0", 10)
      if (Number.isNaN(currentHeight) || Math.abs(currentHeight - desiredHeight) > 10) {
        frame.style.height = `${desiredHeight}px`
      }
    }

    window.parent?.postMessage({type: "widget-height", height: desiredHeight}, "*")
  } catch (error) {
    console.warn("Cannot resize frame:", error)
  }
}

export function resizeWidget(): void {
  requestAnimationFrame(() => {
    updateWidgetHeight()
    setTimeout(updateWidgetHeight, 100)
  })
}
