import { describe, expect, it } from 'vitest';
import { analyzeTrade, effectiveTotal, type TradeAsset, type ValueSource } from '@/lib/trade-analyzer/analysis';

const assets = (values: number[], prefix: string): TradeAsset[] =>
  values.map((value, i) => ({
    key: prefix + i, name: prefix + i, position: 'WR', nflTeam: '',
    value, fcValue: value * 2, ktcValue: value * 3, trend: 0, isPick: false,
  }));

describe('moderate unified package adjustment', () => {
  it('leaves one-for-one trades unadjusted and handles empty sides', () => {
    const a = assets([9000], 'a'), b = assets([6000], 'b');
    expect(analyzeTrade(a, b)).toMatchObject({ effA: 9000, effB: 6000 });
    expect(analyzeTrade(a, []).effA).toBe(9000);
  });
  it('retains more value for two stars than a pile of lesser assets', () => {
    const a = assets([9000], 'a');
    const packages = [[6000,6000],[4000,4000,4000],[3000,3000,3000,3000],[2000,2000,2000,2000,2000,2000]];
    const totals = packages.map(p => analyzeTrade(a, assets(p, 'b')).effB);
    expect(totals[0]).toBe(10950);
    expect(totals[1]).toBeLessThan(totals[0]);
    expect(totals[2]).toBeLessThan(totals[1]);
    expect(totals[3]).toBeLessThan(totals[2]);
    expect(totals[3]).toBeLessThan(9000);
  });
  it('handles balanced two-for-two trades and concentration differences', () => {
    const a = assets([8000,1000], 'a'), b = assets([4500,4500], 'b');
    expect(analyzeTrade(a,b).effA).toBeGreaterThan(analyzeTrade(a,b).effB);
    const equal = analyzeTrade(assets([7000,7000], 'a'), assets([7000,7000], 'b'));
    expect(equal.effA).toBe(14000);
    expect(equal.effB).toBe(14000);
  });
  for (const source of ['avg','fc','ktc'] as ValueSource[]) {
    it('is symmetric, order independent, monotonic and reconciles totals in ' + source, () => {
      for (let i = 1; i <= 100; i++) {
        const a = assets(Array.from({length: 1 + i % 12}, (_,j) => 50 + (i * 379 + j * 613) % 9950), 'a');
        const b = assets(Array.from({length: 1 + (i * 3) % 10}, (_,j) => 50 + (i * 691 + j * 487) % 9950), 'b');
        const result = analyzeTrade(a,b,source);
        const swapped = analyzeTrade(b,a,source);
        expect(result.effA).toBe(swapped.effB);
        expect(result.effB).toBe(swapped.effA);
        expect(analyzeTrade([...a].reverse(), b, source).effA).toBe(result.effA);
        expect(result.effA).toBeLessThanOrEqual(result.rawA);
        expect(result.effB).toBeLessThanOrEqual(result.rawB);
        const extra = assets([50 + (i * 997) % 9950], 'extra');
        expect(analyzeTrade([...a,...extra], b, source).effA).toBeGreaterThanOrEqual(result.effA);
        const best = Math.max(...b.map(v => source === 'fc' ? v.fcValue! : source === 'ktc' ? v.ktcValue! : v.value));
        const total = effectiveTotal(a,source,best);
        expect([...total.perPlayer.values()].reduce((s,v) => s+v,0)).toBe(total.total);
      }
    });
  }
});
