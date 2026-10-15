export interface ExternalPortalLink {
  label: string
  href: string
}

export const docksPortalLinks: readonly ExternalPortalLink[] = Object.freeze([
  {label: "Docks", href: "https://docks.portdebarcelona.cat"},
  {label: "Docks Pre", href: "https://dockspre.portdebarcelona.cat"},
  {label: "Gestramdes", href: "https://gestramdes.portdebarcelona.cat/"},
  {label: "Docks Sharepoint", href: "https://portdebarcelona.sharepoint.com/sites/Docks"},
])
