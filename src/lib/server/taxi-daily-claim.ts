import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export function easternDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return [value('year'), value('month'), value('day')].join('-');
}

function sqlClient() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error('Taxi daily audit requires the existing Postgres connection.');
  return neon(url);
}

/**
 * Atomically claim at most one automatic full audit per Eastern calendar day.
 * A commissioner-initiated report uses a different endpoint and is never limited.
 * Stale claims can recover after 30 minutes if a function exits unexpectedly.
 */
export async function claimTaxiAuditDay(day: string): Promise<string | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid taxi audit day');
  const claimId = randomUUID();
  const sql = sqlClient();
  const claimed = await sql`
    INSERT INTO taxi_daily_audit_claims (day_et, claim_id, status, claimed_at)
    VALUES (${day}::date, ${claimId}, 'running', now())
    ON CONFLICT (day_et) DO UPDATE
      SET claim_id = EXCLUDED.claim_id,
          claimed_at = now(),
          status = 'running',
          finished_at = null
    WHERE taxi_daily_audit_claims.status = 'running'
      AND taxi_daily_audit_claims.claimed_at < now() - INTERVAL '30 minutes'
    RETURNING claim_id
  `;
  return claimed.length ? claimId : null;
}

export async function finishTaxiAuditDay(day: string, claimId: string, success: boolean): Promise<void> {
  const sql = sqlClient();
  await sql`
    UPDATE taxi_daily_audit_claims
    SET status = ${success ? 'complete' : 'failed'}, finished_at = now()
    WHERE day_et = ${day}::date AND claim_id = ${claimId}
  `;
}
