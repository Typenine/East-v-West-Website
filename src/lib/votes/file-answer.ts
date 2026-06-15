export type PollFileAnswer = {
  key: string;
  filename: string;
  contentType: string;
  size?: number;
};

export function parseFileAnswer(raw: string | null | undefined): PollFileAnswer | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.key !== 'string' || typeof o.filename !== 'string') return null;
    return {
      key: o.key,
      filename: o.filename,
      contentType: typeof o.contentType === 'string' ? o.contentType : 'application/octet-stream',
      size: typeof o.size === 'number' ? o.size : undefined,
    };
  } catch {
    return null;
  }
}

export function serializeFileAnswer(data: PollFileAnswer): string {
  return JSON.stringify(data);
}

export const DEFAULT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export function fileMaxBytesFromQuestion(maxLength: number | null): number {
  if (maxLength != null && maxLength > 0) return maxLength;
  return DEFAULT_FILE_MAX_BYTES;
}
