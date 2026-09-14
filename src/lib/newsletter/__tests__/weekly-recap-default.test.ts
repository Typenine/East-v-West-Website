import { describe, expect, it } from 'vitest';
import { getGenerationSteps, getRequiredSteps } from '../compose-step-weekly';
import { getExternalEpisodeFormat } from '../external-generation-weekly';
import { WEEKLY_FIRST_ROUND_BYES, WEEKLY_PLAYOFF_SPOTS, WEEKLY_RECAP_VISIBLE_ORDER } from '../weekly-recap-types';

describe('permanent weekly recap format', () => {
  it('uses the canonical staged generation sequence for regular episodes', () => {
    expect(getGenerationSteps('regular', 6, 3)).toEqual([
      'Intro',
      'Transactions',
      'Recap_0', 'Recap_1', 'Recap_2', 'Recap_3', 'Recap_4', 'Recap_5',
      'PowerRankings',
      'LeaguePulse',
      'ClancyInsert',
      'StockWatch',
      'ReceiptDesk',
      'Forecast',
      'FinalWord',
      'SocialSummary',
    ]);
  });

  it('makes all six recaps and canonical data sections required', () => {
    const required = getRequiredSteps('regular', 6, 3);
    for (const step of ['Intro', 'Transactions', 'PowerRankings', 'LeaguePulse', 'Forecast', 'FinalWord']) {
      expect(required).toContain(step);
    }
    for (let i = 0; i < 6; i += 1) expect(required).toContain(`Recap_${i}`);
  });

  it('exports the exact canonical visible order', () => {
    expect(WEEKLY_RECAP_VISIBLE_ORDER).toEqual([
      'Intro',
      'WeeklyTransactions',
      'MatchupRecaps',
      'PowerRankings',
      'LeaguePulse',
      'StockWatch',
      'ReceiptDesk',
      'Forecast',
      'FinalWord',
    ]);
    expect(getExternalEpisodeFormat('regular').sections).toEqual([
      '1. Opening Exchange',
      '2. Transactions Since the Last Issue',
      '3. All Six Completed Matchup Reviews',
      '4. Weekly Power Rankings',
      '5. League Pulse',
      '6. Stock Watch',
      "7. Clancy's Receipt Desk",
      '8. All Six Upcoming Matchup Previews',
      '9. Final Word',
    ]);
  });

  it('uses the seven-team playoff format with one bye', () => {
    expect(WEEKLY_PLAYOFF_SPOTS).toBe(7);
    expect(WEEKLY_FIRST_ROUND_BYES).toBe(1);
  });
});
