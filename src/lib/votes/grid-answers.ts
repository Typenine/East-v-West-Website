/** Multiple-choice grid: one column per row. */
export type McGridAnswer = Record<string, string>;

/** Checkbox grid: multiple columns per row. */
export type CbGridAnswer = Record<string, string[]>;

export function parseMcGridAnswer(raw: string | null | undefined): McGridAnswer {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: McGridAnswer = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function parseCbGridAnswer(raw: string | null | undefined): CbGridAnswer {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CbGridAnswer = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeGridAnswer(data: McGridAnswer | CbGridAnswer): string {
  return JSON.stringify(data);
}
