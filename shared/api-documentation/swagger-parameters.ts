// Preserve the existing DevExtreme query-object-to-array adapter. Other query
// parameters and the path/server/version remain untouched.
const arrayQueries = new Set(['sort', 'group', 'totalSummary', 'groupSummary']);
export function adaptArrayQueries(value: string): string {
  const url = new URL(value, globalThis.location?.href ?? 'http://localhost/');
  let changed = false;
  for (const name of arrayQueries) {
    const original = url.searchParams.get(name);
    if (!original?.trim().startsWith('{')) continue;
    try {
      const object = JSON.parse(original);
      if (object && typeof object === 'object' && !Array.isArray(object)) {
        url.searchParams.set(name, JSON.stringify([object])); changed = true;
      }
    } catch { /* Leave non-JSON values as entered by the consumer. */ }
  }
  return changed ? url.href : value;
}
