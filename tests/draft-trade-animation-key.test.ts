import { describe, expect, it } from 'vitest';
import { draftTradeAnimationKey } from '@/components/draft-overlay/draft-display-utils';

describe('draft trade animation identity', () => {
  it('distinguishes consecutive trades with the same teams and asset count', () => {
    const first = draftTradeAnimationKey({ tradeId: 'trade-1', teams: ['A', 'B'], assets: [{}, {}] });
    const second = draftTradeAnimationKey({ tradeId: 'trade-2', teams: ['A', 'B'], assets: [{}, {}] });

    expect(first).not.toBe(second);
  });

  it('keeps a deterministic fallback for a legacy pending payload', () => {
    expect(draftTradeAnimationKey({ teams: ['A', 'B'], assets: [{}] }))
      .toBe('legacy:["A","B"]:1');
  });
});
