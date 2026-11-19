import { describe, expect, it } from 'vitest';
import { buildTradeDeadlineAudit } from '../trade-deadline-export';
import type { Trade } from '@/lib/utils/trades';

const start = '2026-09-10T00:20:00.000Z';
const deadline = '2026-12-01T04:45:00.000Z';
const published = '2026-11-15T18:00:00.000Z';
const exported = '2026-12-01T17:00:00.000Z';

function trade(id: string, date: string, status: Trade['status'] = 'completed', precise = true): Trade {
  return {
    id, date, status, season: '2026', week: 12,
    created: precise ? Date.parse(date + 'T18:00:00.000Z') : null,
    teams: [
      { name: 'Belleview Badgers', assets: [{ type: 'player', name: 'Player A' }] },
      { name: 'Red Pandas', assets: [{ type: 'pick', name: '2027 2nd' }] },
    ],
  };
}

function audit(trades: Trade[], recentPublishedIssues: Array<{ id: string; title?: string; sections?: unknown }> = []) {
  return buildTradeDeadlineAudit({
    season: 2026,
    regularSeasonStartAt: start,
    deadlineAt: deadline,
    exportedAt: exported,
    previousPublishedIssueCutoff: published,
    trades,
    recentPublishedIssues,
  });
}

describe('Trade Deadline ChatGPT Source Pack audit', () => {
  it('includes all completed in-season trades chronologically, not just those after the last published issue', () => {
    const result = audit([
      trade('later', '2026-11-29'),
      trade('before-published', '2026-11-12'),
      trade('offseason', '2026-07-23'),
      trade('out-of-window', '2026-12-04'),
    ]);
    expect(result.completedTrades.map(t => t.id)).toEqual(['before-published', 'later']);
    expect(result.completedTrades[0].priorCoverage.relativeToLatestPublication).toBe('before_or_equal');
    expect(result.completedTrades[1].priorCoverage.relativeToLatestPublication).toBe('after');
    expect(result.completedTrades[0].priorCoverage.status).toBe('not_verified');
    expect(result.counts.completed).toBe(2);
  });

  it('marks prior issue coverage only when a matching trade id appears in saved published sections', () => {
    const result = audit([trade('deal-44', '2026-11-11')], [{
      id: 'published-1', title: 'Week 10',
      sections: [{ type: 'Trades', data: [{ id: 'deal-44' }] }],
    }]);
    expect(result.completedTrades[0].priorCoverage).toMatchObject({
      status: 'verified_trade_id_in_exported_issue',
      issueIds: ['published-1'],
    });
    expect(result.counts.verifiedPreviouslyCoveredByTradeId).toBe(1);
  });

  it('separates pending trades and flags date-only records on deadline day', () => {
    const result = audit([
      trade('done', '2026-11-30', 'completed', false),
      trade('pending', '2026-11-30', 'pending'),
      trade('veto', '2026-11-30', 'vetoed'),
    ]);
    expect(result.completedTrades.map(t => t.id)).toEqual(['done']);
    expect(result.pendingTrades.map(t => t.id)).toEqual(['pending']);
    expect(result.completedTrades[0].timingNeedsVerification).toBe(true);
    expect(result.counts.completedWithDateOnlyTiming).toBe(1);
    expect(result.warnings.join(' ')).toContain('Pending trades');
  });

  it('includes date-only records on opening day and deduplicates matching transaction ids', () => {
    const result = audit([
      trade('kickoff', '2026-09-09', 'completed', false),
      trade('kickoff', '2026-09-09', 'completed', false),
    ]);
    expect(result.completedTrades.map(t => t.id)).toEqual(['kickoff']);
    expect(result.warnings.join(' ')).toContain('Duplicate trade ID');
  });

  it('does not imply an empty feed means there were no trades', () => {
    const result = audit([]);
    expect(result.counts.completed).toBe(0);
    expect(result.warnings.join(' ')).toContain('Verify the all-time trade feed');
  });
});
