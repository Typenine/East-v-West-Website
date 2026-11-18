import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { easternDay } from '../src/lib/server/taxi-daily-claim';

describe('taxi on-demand daily report', () => {
  it('uses Eastern calendar days including midnight and daylight saving', () => {
    expect(easternDay(new Date('2026-11-18T04:59:59Z'))).toBe('2026-11-17');
    expect(easternDay(new Date('2026-11-18T05:00:00Z'))).toBe('2026-11-18');
    expect(easternDay(new Date('2026-07-18T03:59:59Z'))).toBe('2026-07-17');
    expect(easternDay(new Date('2026-07-18T04:00:00Z'))).toBe('2026-07-18');
  });

  it('uses one atomic database claim and never schedules an automatic run', () => {
    const gate = readFileSync('src/lib/server/taxi-daily-claim.ts', 'utf8');
    const api = readFileSync('src/app/api/taxi/daily/route.ts', 'utf8');
    const workflow = readFileSync('.github/workflows/taxi-cron.yml', 'utf8');
    expect(gate).toContain('ON CONFLICT (day_et) DO UPDATE');
    expect(gate).toContain("WHERE taxi_daily_audit_claims.status = 'running'");
    expect(api).toContain('claimTaxiAuditDay(day)');
    expect(api).toContain('finishTaxiAuditDay(day, claimId, success)');
    expect(api).toContain("Same-origin request required");
    expect(api).toContain('runTaxiReport()');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s+schedule:/m);
  });

  it('keeps the commissioner rerun independent of the daily claim', () => {
    const route = readFileSync('src/app/api/taxi/report/route.ts', 'utf8');
    expect(route).toContain('isAdminCookieValue');
    expect(route).toContain('isCronAuthorized');
    expect(route).not.toContain('claimTaxiAuditDay');
  });

  it('never computes league projections during a homepage view', () => {
    const home = readFileSync('src/components/home/SeasonLaunchHome.tsx', 'utf8');
    expect(home).not.toContain('buildLeagueProjectionSnapshotsV3');
    expect(home).toContain('loadProjectionSnapshotsForWeek');
  });
});
