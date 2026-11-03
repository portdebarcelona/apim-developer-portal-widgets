export function openApi(apiName: string | null | undefined, route: string): void {
  const encodedApiName = encodeURIComponent(apiName ?? "")
  let url = `/${route}#api=${encodedApiName}`

  try {
    url = `${window.parent.location.origin}/${route}#api=${encodedApiName}`
  } catch {
    // Keep the relative fallback when the parent window cannot be accessed.
  }

  const opened = window.open(url, "_blank")

  if (opened) {
    opened.opener = null
    return
  }

  window.location.href = url
}
