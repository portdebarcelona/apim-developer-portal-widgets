import type {LoadedApi} from './types';

export function apiFromHash(hash: string): string {
  const match = hash.match(/(?:^#|[&#])api=([^&]*)/);
  if (!match) return '';
  // Scalar appends its own section route after the API fragment. This is not a
  // new APIM API/version and must not cause a metadata reload or erase auth.
  try { return decodeURIComponent(match[1].split('/')[0]); } catch { return ''; }
}

/** One load at a time; both AbortController and a generation check are needed
 * because transports, cached responses or OAuth promises may finish after abort. */
export class ApiNavigation {
  private generation = 0;
  private abort?: AbortController;
  private selected?: string;
  private disposed = false;
  constructor(private load: (api: string, signal: AbortSignal) => Promise<LoadedApi>,
    private reset: (api: string) => void, private accept: (result: LoadedApi) => void,
    private fail: (message: string) => void) {}
  async select(api: string, force = false) {
    if (this.disposed || !force && api === this.selected) return;
    this.selected = api;
    const generation = ++this.generation;
    this.abort?.abort();
    this.abort = new AbortController();
    this.reset(api);
    if (!api) return;
    try {
      const result = await this.load(api, this.abort.signal);
      if (!this.disposed && generation === this.generation) this.accept(result);
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.fail(error instanceof Error ? error.message : 'No se pudo cargar la API.');
    }
  }
  dispose() { this.disposed = true; this.generation++; this.abort?.abort(); }
}

export function observeNavigation(onChange: (api: string) => void, current: Window = window) {
  const windows = new Set<Window>([current]);
  try { if (current.parent.location.href) windows.add(current.parent); } catch { /* sandbox: APIM copies parent hash to iframe */ }
  const read = () => {
    let hash = current.location.hash;
    try { if (current.parent !== current) hash = current.parent.location.hash; } catch { /* use iframe hash */ }
    onChange(apiFromHash(hash));
  };
  for (const target of windows) target.addEventListener('hashchange', read);
  read();
  return () => { for (const target of windows) target.removeEventListener('hashchange', read); };
}
