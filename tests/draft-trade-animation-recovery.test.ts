import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();
vi.mock('@/server/db/client', () => ({ getDb: () => ({ execute: mockExecute }) }));

import { checkStaleTradeAnimationV149 } from '@/server/draft-v149/transition';

describe('stale trade animation recovery', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('does nothing while the animation is still within its recovery window', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    await expect(checkStaleTradeAnimationV149('00000000-0000-0000-0000-000000000001'))
      .resolves.toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('releases a stale trade pause and clears its pending animation', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: 'draft-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'draft-1' }] });

    await expect(checkStaleTradeAnimationV149('00000000-0000-0000-0000-000000000001'))
      .resolves.toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('is safe when another client already released the pause', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: 'draft-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(checkStaleTradeAnimationV149('00000000-0000-0000-0000-000000000001'))
      .resolves.toBe(false);
  });
});
