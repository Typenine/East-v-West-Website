/**
 * Field-path helpers shared by the Edit Mode UI and the edit API.
 *
 * Paths address values inside a newsletter section's `data` object, e.g.
 * "picks.0.mason.analysis". Historically these were plain dot-joined strings,
 * which silently broke when a segment itself contained a dot — real team names
 * like "Mt. Lebanon Cake Eaters" appear as keys in Trades analysis maps, so
 * "0.analysis.Mt. Lebanon Cake Eaters.entertainer_paragraph" split into garbage
 * segments ("Mt" / " Lebanon Cake Eaters"). Reads returned empty text and
 * writes corrupted the section data.
 *
 * Encoding rule: if any segment contains a dot, the path is a JSON string
 * array (starts with "["). Otherwise it stays a plain dot-joined string, so
 * existing stored paths keep working.
 */

export function joinFieldPath(segments: Array<string | number>): string {
  const strs = segments.map(String);
  return strs.some(s => s.includes('.')) ? JSON.stringify(strs) : strs.join('.');
}

export function splitFieldPath(path: string): string[] {
  if (path.startsWith('[')) {
    try {
      const arr = JSON.parse(path);
      if (Array.isArray(arr)) return arr.map(String);
    } catch { /* fall through to dot-split */ }
  }
  return path.split('.');
}

/** Walk a field path and return the leaf value (or undefined). */
export function getValueAtPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const p of splitFieldPath(path)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Walk a field path and set the leaf value, creating intermediate
 * objects/arrays as needed (numeric next-segment ⇒ array).
 */
export function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = splitFieldPath(path);
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === undefined || cur[p] === null || typeof cur[p] !== 'object') {
      cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
