/** Retain the recovered OAuth dialog's fixed public client and required scopes.
 * Scope this to the associated OAuth container so Basic/Bearer/password fields
 * belonging to other consumer schemes remain editable and visible. */
export function lockAssociatedOAuth(element: HTMLElement, serverId?: string, requiredScopes: string[] = []) {
  if (!serverId) return () => {};
  const apply = () => {
    for (const container of element.querySelectorAll<HTMLElement>('.auth-container')) {
      const heading = container.querySelector('h4');
      const id = heading?.querySelector('code')?.textContent?.trim() ?? heading?.textContent?.trim().split(/[\s(]/)[0];
      if (id !== serverId && !id?.startsWith(`${serverId}-oauth-`)) continue;
      for (const label of container.querySelectorAll('label')) {
        const text = (label.textContent ?? '').toLowerCase().replace(/[_:]/g, ' ');
        const wrapper = label.closest('.wrapper') ?? label.parentElement;
        if (text.includes('client id')) {
          const input = wrapper?.querySelector('input');
          if (input) {input.readOnly = true; input.setAttribute('aria-readonly', 'true');}
        }
        if (text.includes('client secret')) wrapper?.remove();
      }
      for (const input of container.querySelectorAll<HTMLInputElement>('.scopes input[type="checkbox"]')) {
        if (!requiredScopes.length) continue;
        // Preserve the API's required scopes, not all server-wide scopes.
        input.disabled = true;
        input.setAttribute('aria-disabled', 'true');
      }
    }
  };
  const observer = new MutationObserver(apply);
  observer.observe(element, {childList: true, subtree: true});
  apply();
  return () => observer.disconnect();
}
