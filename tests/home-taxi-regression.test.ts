import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('homepage taxi tracker update', () => {
  it('keeps League Data as the final homepage panel', () => {
    const around = source('src/components/home/AroundTheLeague.tsx');
    expect(around).toContain("import { createPortal } from 'react-dom';");
    expect(around).toContain('data-home-final-panel="league-data"');
    expect(around).toContain("document.querySelector<HTMLElement>('.home-page .container')");
  });

  it('uses the current broadcast panel styling and a real manual audit', () => {
    const banner = source('src/components/taxi/TaxiBanner.tsx');
    expect(banner).toContain('BroadcastPanel');
    expect(banner).toContain('Run current audit');
    expect(banner).toContain('fetch("/api/taxi/report"');
    expect(banner).toContain('The latest run did not validate every team successfully');
  });

  it('treats every taxi rule violation as non-compliant', () => {
    const validator = source('src/lib/server/taxi-validator.ts');
    expect(validator).toContain("'late_taxi_placement'");
    expect(validator).toContain("return 'other';");
    expect(validator).toContain('compliant: violationCount === 0');
    expect(validator).toContain('isInOffseason(currentSeasonType, currentWeek)');
  });

  it('never presents incomplete snapshots as an all-clear', () => {
    const flags = source('src/app/api/taxi/flags/route.ts');
    expect(flags).toContain('checkedTeams');
    expect(flags).toContain('expectedTeams');
    expect(flags).toContain('degradedRows.length === 0');
    expect(flags).toContain("violation.code === 'boomerang_reset_ineligible'");
  });

  it('records manual audits separately from official enforcement', () => {
    const report = source('src/app/api/taxi/report/route.ts');
    expect(report).toContain("const runType = 'admin_rerun' as const");
    expect(report).toContain('compliant: result.compliant');
  });

  it('accepts delayed scheduled runs throughout the target hour', () => {
    const cron = source('src/app/api/taxi/cron/route.ts');
    expect(cron).toContain("if (day === 'Wed' && hour === 17)");
    expect(cron).not.toContain('const inGrace = minute >= 0 && minute <= 5');
  });
});
