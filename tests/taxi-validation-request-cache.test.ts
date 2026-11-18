import { describe, expect, it } from 'vitest';
import { createTaxiValidationRequestCache } from '../src/lib/server/taxi-request-cache';

describe('per-request taxi validation shared loads', () => {
  it('coalesces repeated and concurrent historical loads without sharing across audits', async () => {
    const shared = createTaxiValidationRequestCache();
    let calls = 0;
    const loader = async () => { calls++; return ['2023', '2024', '2025', '2026']; };

    const [a, b] = await Promise.all([
      shared.once('seasons', loader),
      shared.once('seasons', loader),
    ]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
    await shared.once('seasons', loader);
    expect(calls).toBe(1);

    const nextAudit = createTaxiValidationRequestCache();
    await nextAudit.once('seasons', loader);
    expect(calls).toBe(2);
  });

  it('does not poison later lookups after a transient failure', async () => {
    const shared = createTaxiValidationRequestCache();
    let attempts = 0;
    const loader = async () => {
      attempts++;
      if (attempts === 1) throw new Error('upstream timeout');
      return { week: 11 };
    };

    await expect(shared.once('nfl', loader)).rejects.toThrow('upstream timeout');
    await expect(shared.once('nfl', loader)).resolves.toEqual({ week: 11 });
    expect(attempts).toBe(2);
  });

  it('keeps different roster-independent source keys separate', async () => {
    const shared = createTaxiValidationRequestCache();
    expect(await shared.once('2025:transactions', async () => [25]))
      .toEqual([25]);
    expect(await shared.once('2026:transactions', async () => [26]))
      .toEqual([26]);
  });
});
