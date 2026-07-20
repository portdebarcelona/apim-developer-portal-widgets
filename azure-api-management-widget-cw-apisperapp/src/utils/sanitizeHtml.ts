const allowedTags = new Set([
  "A",
  "B",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "I",
  "LI",
  "OL",
  "P",
  "PRE",
  "SPAN",
  "STRONG",
  "U",
  "UL",
])

const globalAttributes = new Set(["class", "title"])
const anchorAttributes = new Set(["href", "target", "rel", "class", "title"])

function isSafeHref(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("/") ||
    normalized.startsWith("#")
  )
}

function sanitizeElement(element: Element): void {
  Array.from(element.children).forEach(sanitizeElement)

  if (!allowedTags.has(element.tagName)) {
    const parent = element.parentNode
    if (!parent) {
      return
    }

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element)
    }

    parent.removeChild(element)
    return
  }

  const allowedAttributes = element.tagName === "A" ? anchorAttributes : globalAttributes

  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase()
    const value = attribute.value

    if (name.startsWith("on") || name === "style" || !allowedAttributes.has(name)) {
      element.removeAttribute(attribute.name)
      return
    }

    if (element.tagName === "A" && name === "href") {
      if (!isSafeHref(value)) {
        element.removeAttribute(attribute.name)
        return
      }

      const normalized = value.trim().toLowerCase()
      if (
        normalized.startsWith("http://") ||
        normalized.startsWith("https://") ||
        normalized.startsWith("mailto:")
      ) {
        element.setAttribute("target", "_blank")
        element.setAttribute("rel", "noopener noreferrer")
      }
    }
  })
}

export function sanitizeHtml(html: string): string {
  if (!html) {
    return ""
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html")
  const wrapper = doc.body.firstElementChild

  if (!wrapper) {
    return ""
  }

  Array.from(wrapper.children).forEach(sanitizeElement)

  return wrapper.innerHTML
}
