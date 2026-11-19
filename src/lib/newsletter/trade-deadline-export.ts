import type { Trade } from '@/lib/utils/trades';

/**
 * Evidence ledger for the externally written post-deadline issue.
 * Only source-pack exports use this module. It does not affect website newsletter generation.
 */
type PreviousIssue = { id: string; title?: string | null; sections?: unknown };

export type DeadlineTradeEntry = {
  id: string;
  recordedDate: string;
  recordedAt: string | null;
  timestampPrecision: 'timestamp' | 'date_only';
  timingNeedsVerification: boolean;
  status: Trade['status'];
  teams: Trade['teams'];
  season: string | null;
  week: number | null;
  priorCoverage: {
    status: 'verified_trade_id_in_exported_issue' | 'not_verified';
    issueIds: string[];
    issueTitles: string[];
    relativeToLatestPublication: 'after' | 'before_or_equal' | 'same_date_uncertain' | 'unknown';
  };
};

export type TradeDeadlineAudit = {
  kind: 'post_deadline_trade_audit';
  season: number;
  selectedWeek: 12;
  regularSeasonStartAt: string;
  deadlineAt: string;
  exportedAt: string;
  previousPublishedIssueCutoff: string | null;
  completedTrades: DeadlineTradeEntry[];
  pendingTrades: DeadlineTradeEntry[];
  counts: {
    completed: number;
    pending: number;
    completedWithDateOnlyTiming: number;
    verifiedPreviouslyCoveredByTradeId: number;
  };
  warnings: string[];
  instructions: string[];
};

function normalizeTradeTime(trade: Trade): { time: number; precision: 'timestamp' | 'date_only' } | null {
  if (typeof trade.created === 'number' && Number.isFinite(trade.created) && trade.created > 0) {
    const time = trade.created < 100_000_000_000 ? trade.created * 1000 : trade.created;
    if (Number.isFinite(time) && !Number.isNaN(new Date(time).getTime())) return { time, precision: 'timestamp' };
  }
  const day = String(trade.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(day + 'T12:00:00Z');
  return Number.isFinite(time) ? { time, precision: 'date_only' } : null;
}

function easternDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find(x => x.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

export function buildTradeDeadlineAudit(input: {
  season: number;
  regularSeasonStartAt: string;
  deadlineAt: string;
  exportedAt: string;
  previousPublishedIssueCutoff?: string | null;
  trades: Trade[];
  recentPublishedIssues?: PreviousIssue[];
}): TradeDeadlineAudit {
  const startMs = Date.parse(input.regularSeasonStartAt);
  const deadlineMs = Date.parse(input.deadlineAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(deadlineMs) || deadlineMs <= startMs) {
    throw new Error('Invalid trade deadline season window.');
  }

  const previousCutoff = input.previousPublishedIssueCutoff || null;
  const priorCutoffMs = previousCutoff ? Date.parse(previousCutoff) : NaN;
  const deadlineDay = easternDay(input.deadlineAt);
  const seasonStartDay = easternDay(input.regularSeasonStartAt);
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const completedTrades: DeadlineTradeEntry[] = [];
  const pendingTrades: DeadlineTradeEntry[] = [];

  for (const trade of input.trades) {
    if (trade.status !== 'completed' && trade.status !== 'pending') continue;
    if (seenIds.has(String(trade.id))) {
      warnings.push('Duplicate trade ID ' + trade.id + ' was ignored in the deadline ledger.');
      continue;
    }
    seenIds.add(String(trade.id));
    const recorded = normalizeTradeTime(trade);
    if (!recorded) {
      warnings.push('Trade ' + trade.id + ' has no verifiable date and needs manual inspection.');
      continue;
    }
    // The season window is intentionally the full in-season run, not only Week 12.
    // Date-only source records near a boundary are admitted with a verification flag.
    const dayOnly = recorded.precision === 'date_only';
    const tradeDay = String(trade.date || '').slice(0, 10);
    const dateOnlyOnDeadline = dayOnly && tradeDay === deadlineDay;
    const inWindow = dayOnly
      ? tradeDay >= seasonStartDay && tradeDay <= deadlineDay
      : recorded.time >= startMs && recorded.time <= deadlineMs;
    if (!inWindow) continue;

    const priorIssueMatches = (input.recentPublishedIssues || []).filter(issue =>
      issue.sections != null && JSON.stringify(issue.sections).includes(JSON.stringify(String(trade.id)))
    );
    let relativeToLatestPublication: DeadlineTradeEntry['priorCoverage']['relativeToLatestPublication'] = 'unknown';
    if (Number.isFinite(priorCutoffMs)) {
      if (dayOnly && new Date(priorCutoffMs).toISOString().slice(0, 10) === tradeDay) {
        relativeToLatestPublication = 'same_date_uncertain';
      } else {
        relativeToLatestPublication = recorded.time > priorCutoffMs ? 'after' : 'before_or_equal';
      }
    }

    const entry: DeadlineTradeEntry = {
      id: String(trade.id),
      recordedDate: trade.date,
      recordedAt: dayOnly ? null : new Date(recorded.time).toISOString(),
      timestampPrecision: recorded.precision,
      timingNeedsVerification: dateOnlyOnDeadline,
      status: trade.status,
      teams: trade.teams,
      season: trade.season ?? null,
      week: trade.week ?? null,
      priorCoverage: {
        status: priorIssueMatches.length ? 'verified_trade_id_in_exported_issue' : 'not_verified',
        issueIds: priorIssueMatches.map(issue => issue.id),
        issueTitles: priorIssueMatches.map(issue => issue.title || issue.id),
        relativeToLatestPublication,
      },
    };
    (trade.status === 'completed' ? completedTrades : pendingTrades).push(entry);
  }

  const chronological = (a: DeadlineTradeEntry, b: DeadlineTradeEntry) =>
    a.recordedDate.localeCompare(b.recordedDate) ||
    (a.recordedAt || '').localeCompare(b.recordedAt || '') ||
    a.id.localeCompare(b.id);
  completedTrades.sort(chronological);
  pendingTrades.sort(chronological);

  if (!completedTrades.length) {
    warnings.push('No completed in-season trades were recovered. Verify the all-time trade feed before calling the league inactive.');
  }
  if (pendingTrades.length) {
    warnings.push('Pending trades must not be graded as completed deals. Some may have been accepted before the deadline but await commissioner processing.');
  }
  if (completedTrades.some(trade => trade.timingNeedsVerification)) {
    warnings.push('Date-only trades on deadline day need acceptance-time verification before treating them as timely.');
  }

  return {
    kind: 'post_deadline_trade_audit',
    season: input.season,
    selectedWeek: 12,
    regularSeasonStartAt: input.regularSeasonStartAt,
    deadlineAt: input.deadlineAt,
    exportedAt: input.exportedAt,
    previousPublishedIssueCutoff: previousCutoff,
    completedTrades,
    pendingTrades,
    counts: {
      completed: completedTrades.length,
      pending: pendingTrades.length,
      completedWithDateOnlyTiming: completedTrades.filter(trade => trade.timingNeedsVerification).length,
      verifiedPreviouslyCoveredByTradeId: completedTrades.filter(trade => trade.priorCoverage.status === 'verified_trade_id_in_exported_issue').length,
    },
    warnings,
    instructions: [
      'This deadline ledger is an ADDITIONAL feature inside the full Week 12 Weekly Recap, not a substitute issue. Every recurring weekly section still must appear in full.',
      'This ledger covers every recovered completed trade from regular-season kickoff through the end-of-Week-12 deadline. Earlier offseason trades remain in historyAndTransactions as background.',
      'Audit every completed trade by ID in chronological order, including deals already discussed in prior issues. Expand important transactions; give smaller but still substantive deals concise judgment.',
      'Previous publication before a trade does not prove the trade was covered. Claim earlier coverage only when supported by published sections or a verified receipt. No exact-ID match means unverified, not never covered.',
      'Recorded trade creation date is not proof of proposal acceptance time. A trade accepted before the deadline may be processed later. Check uncertain deadline-day or pending cases against league rules and receipts.',
      'Keep completed and pending trades separate, identify missing or contradictory evidence, and never fill gaps with invented assets, timestamps, or grades.',
      'Build independent Mason and Westy verdicts and grades for each completed deal, and evaluate all 12 franchises, including teams making no trades.',
    ],
  };
}
