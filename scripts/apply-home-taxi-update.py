from __future__ import annotations

from pathlib import Path
import re

STAMP = Path('.home-taxi-update-applied')


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    if old not in text:
        if new in text:
            return
        raise RuntimeError(f'{path}: expected replacement source was not found')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count == 0:
        if replacement in text:
            return
        raise RuntimeError(f'{path}: expected regex replacement source was not found')
    file_path.write_text(updated, encoding='utf-8')


def write_file(path: str, content: str) -> None:
    Path(path).write_text(content, encoding='utf-8')


def main() -> None:
    if STAMP.exists():
        print('[home-taxi-update] Source update already applied in this workspace.')
        return

    # ------------------------------------------------------------------
    # Keep League Data physically last on the homepage in every phase.
    # AroundTheLeague is already a client component, so portal its existing
    # export panel to the end of the homepage container after hydration.
    # ------------------------------------------------------------------
    around_path = 'src/components/home/AroundTheLeague.tsx'
    replace_once(
        around_path,
        "import { useEffect, useState } from 'react';",
        "import { useEffect, useState } from 'react';\nimport { createPortal } from 'react-dom';",
    )
    replace_regex(
        around_path,
        r"function LeagueDataPanel\(\) \{.*?\n\}\n\ntype FilterKey",
        r'''function LeagueDataPanel() {
  const accent = '#38bdf8';
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.querySelector<HTMLElement>('.home-page .container'));
  }, []);

  if (!portalRoot) return null;

  return createPortal(
    <section className="mb-2 sm:mb-3" data-home-final-panel="league-data">
      <SectionHeader
        title="League data"
        subtitle="Download current league records as JSON"
      />
      <BroadcastPanel accent={accent} title="Data exports" meta="6 downloads">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DATA_EXPORTS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              download
              className="group flex min-h-32 flex-col justify-between rounded-xl p-4 transition duration-200 hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: item.featured ? `${accent}16` : PANEL.tintSoft,
                boxShadow: `inset 0 0 0 1px ${item.featured ? `${accent}66` : PANEL.hairline}`,
              }}
              aria-label={`Download ${item.label} as JSON`}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em]"
                      style={{ color: accent, background: `${accent}1f`, border: `1px solid ${accent}44` }}
                    >
                      JSON
                    </span>
                    {item.featured && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                        Complete
                      </span>
                    )}
                  </div>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0 transition-transform group-hover:translate-y-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{ color: item.featured ? accent : PANEL.muted }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
                  </svg>
                </div>
                <div className="mt-3 text-sm font-semibold" style={broadcastBodyTextStyle}>
                  {item.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={broadcastMutedTextStyle}>
                  {item.description}
                </p>
              </div>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: item.featured ? accent : PANEL.muted }}>
                Download file
              </div>
            </a>
          ))}
        </div>
      </BroadcastPanel>
    </section>,
    portalRoot,
  );
}

type FilterKey''',
    )

    # ------------------------------------------------------------------
    # Restyle the homepage taxi tracker with current broadcast components.
    # Automatic hydration reads the latest stored audit; the explicit button
    # runs a fresh full audit rather than merely re-fetching stale snapshots.
    # ------------------------------------------------------------------
    write_file(
        'src/components/taxi/TaxiBanner.tsx',
        r'''"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/ui/SectionHeader";
import {
  BroadcastAccentBadge,
  BroadcastPanel,
  PANEL,
  broadcastBodyTextStyle,
  broadcastFaintTextStyle,
  broadcastMutedTextStyle,
} from "@/components/ui/BroadcastPanel";

type Flag = { team: string; type: string; message: string };

export type TaxiFlags = {
  generatedAt: string;
  lastRunAt?: string;
  runType?: string;
  season?: number;
  week?: number;
  actual: Flag[];
  potential: Flag[];
  complete?: boolean;
  degraded?: boolean;
  checkedTeams?: number;
  expectedTeams?: number;
};

const RUN_LABELS: Record<string, string> = {
  wed_warn: "Wednesday warning audit",
  thu_warn: "Thursday warning audit",
  sun_am_warn: "Sunday morning audit",
  sun_pm_official: "Sunday official audit",
  admin_rerun: "Current manual audit",
};

function formatAuditTime(value?: string): string {
  if (!value) return "No completed audit";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No completed audit";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function FlagList({ flags, accent }: { flags: Flag[]; accent: string }) {
  return (
    <div className="space-y-2">
      {flags.map((flag, index) => (
        <div
          key={`${flag.team}-${flag.type}-${index}`}
          className="rounded-xl px-3 py-2.5 text-sm leading-relaxed"
          style={{
            background: `${accent}12`,
            boxShadow: `inset 0 0 0 1px ${accent}36`,
            color: PANEL.text,
          }}
        >
          {flag.message}
        </div>
      ))}
    </div>
  );
}

export default function TaxiBanner({ initial }: { initial: TaxiFlags }) {
  const [flags, setFlags] = useState<TaxiFlags>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: Partial<TaxiFlags>) => {
    setFlags((previous) => ({
      generatedAt: payload.generatedAt || previous.generatedAt || new Date().toISOString(),
      lastRunAt: payload.lastRunAt || previous.lastRunAt,
      runType: payload.runType || previous.runType,
      season: payload.season ?? previous.season,
      week: payload.week ?? previous.week,
      actual: Array.isArray(payload.actual) ? payload.actual : previous.actual || [],
      potential: Array.isArray(payload.potential) ? payload.potential : previous.potential || [],
      complete: payload.complete ?? previous.complete,
      degraded: payload.degraded ?? previous.degraded,
      checkedTeams: payload.checkedTeams ?? previous.checkedTeams,
      expectedTeams: payload.expectedTeams ?? previous.expectedTeams,
    }));
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      const response = await fetch("/api/taxi/flags", { cache: "no-store" });
      if (!response.ok) return;
      applyPayload((await response.json()) as Partial<TaxiFlags>);
    } catch {
      // The server-rendered snapshot remains available when a background refresh fails.
    }
  }, [applyPayload]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const runCurrentAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/taxi/report", { cache: "no-store" });
      if (!response.ok) throw new Error("audit_failed");
      applyPayload((await response.json()) as Partial<TaxiFlags>);
    } catch {
      setError("The current audit could not be completed. The last stored audit is still shown.");
    } finally {
      setLoading(false);
    }
  };

  const incomplete = flags.degraded === true || flags.complete === false;
  const hasActual = flags.actual.length > 0;
  const hasPotential = flags.potential.length > 0;

  const presentation = useMemo(() => {
    if (hasActual) return { accent: "#ef4444", title: "Taxi violations", badge: "Action required" };
    if (incomplete) return { accent: "#f59e0b", title: "Taxi audit incomplete", badge: "Review status" };
    if (hasPotential) return { accent: "#f59e0b", title: "Taxi issues to review", badge: "Warning" };
    if (flags.runType) return { accent: "#10b981", title: "Taxi squads compliant", badge: "Clear" };
    return { accent: "#38bdf8", title: "Taxi squad tracker", badge: "Awaiting audit" };
  }, [flags.runType, hasActual, hasPotential, incomplete]);

  const runLabel = flags.runType ? RUN_LABELS[flags.runType] || flags.runType : "No completed audit";
  const teamCoverage = flags.expectedTeams
    ? `${flags.checkedTeams ?? 0}/${flags.expectedTeams} teams checked`
    : undefined;

  return (
    <section className="mb-10 sm:mb-12" aria-label="Taxi squad tracker">
      <SectionHeader
        title="Taxi squad tracker"
        subtitle="Automated checks for Rule 5.5 compliance"
        actions={
          <Link href="/rules" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)]">
            View taxi rules →
          </Link>
        }
      />

      <BroadcastPanel
        accent={presentation.accent}
        title={presentation.title}
        meta={<BroadcastAccentBadge accent={presentation.accent}>{presentation.badge}</BroadcastAccentBadge>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>{runLabel}</div>
              <div className="mt-1 text-xs" style={broadcastMutedTextStyle}>
                {formatAuditTime(flags.lastRunAt || flags.generatedAt)}
                {teamCoverage ? ` · ${teamCoverage}` : ""}
                {flags.week ? ` · Week ${flags.week}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={runCurrentAudit}
              disabled={loading}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                color: PANEL.text,
                background: `${presentation.accent}24`,
                boxShadow: `inset 0 0 0 1px ${presentation.accent}55`,
              }}
            >
              {loading ? "Running audit…" : "Run current audit"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["4 taxi spots", "1 QB maximum", "No same-tenure return", "Young-player offseason reset"].map((rule) => (
              <div
                key={rule}
                className="rounded-lg px-2.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: PANEL.tintSoft, boxShadow: `inset 0 0 0 1px ${PANEL.hairline}`, color: PANEL.muted }}
              >
                {rule}
              </div>
            ))}
          </div>

          {incomplete && (
            <div className="rounded-xl p-3 text-sm" style={{ background: "#f59e0b14", boxShadow: "inset 0 0 0 1px #f59e0b44", color: PANEL.text }}>
              The latest run did not validate every team successfully. It is not being treated as an all-clear.
            </div>
          )}

          {hasActual && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#ef4444" }}>Official violations</div>
              <FlagList flags={flags.actual} accent="#ef4444" />
            </div>
          )}

          {hasPotential && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#f59e0b" }}>Current warnings</div>
              <FlagList flags={flags.potential} accent="#f59e0b" />
            </div>
          )}

          {!hasActual && !hasPotential && !incomplete && flags.runType && (
            <div className="rounded-xl p-3 text-sm" style={{ background: "#10b98112", boxShadow: "inset 0 0 0 1px #10b9813d", color: PANEL.text }}>
              All checked teams passed the latest full taxi audit.
            </div>
          )}

          {!flags.runType && !incomplete && (
            <div className="text-sm" style={broadcastMutedTextStyle}>
              No full audit has been recorded yet. Run a current audit to check all teams now.
            </div>
          )}

          {error && <div className="text-xs" style={{ color: "#fca5a5" }}>{error}</div>}
          <div className="text-[10px] leading-relaxed" style={broadcastFaintTextStyle}>
            The tracker verifies capacity, quarterback limits, permitted acquisition methods, current-tenure activation restrictions, eligible offseason resets, and Sunday acquisition timing. Managers remain responsible for compliance under Rule 5.5(f).
          </div>
        </div>
      </BroadcastPanel>
    </section>
  );
}
''',
    )

    # ------------------------------------------------------------------
    # Make the validator use the configured season mapping, correctly treat
    # waivers as free-agent intake, classify unknown intake as invalid, apply
    # the rulebook offseason definition, and include every rule violation in
    # the compliance result.
    # ------------------------------------------------------------------
    validator_path = 'src/lib/server/taxi-validator.ts'
    replace_once(
        validator_path,
        "import { LEAGUE_IDS, IMPORTANT_DATES } from '@/lib/constants/league';",
        "import { IMPORTANT_DATES, getLeagueIdForSeason as getConfiguredLeagueIdForSeason } from '@/lib/constants/league';",
    )
    replace_regex(
        validator_path,
        r"function getLeagueIdForSeason\(season: string\): string \| null \{.*?\n\}",
        "function getLeagueIdForSeason(season: string): string | null {\n  return getConfiguredLeagueIdForSeason(season);\n}",
    )
    replace_regex(
        validator_path,
        r"function isInOffseason\(\): boolean \{.*?\n\}",
        r'''function isInOffseason(seasonType?: string, week?: number): boolean {
  const now = new Date();
  if (now >= IMPORTANT_DATES.NFL_WEEK_1_START) return false;

  const normalized = String(seasonType || '').toLowerCase();
  if (normalized === 'pre' || normalized === 'post' || normalized === 'off') return true;

  // Sleeper reports the prior season through the NFL postseason. Week 18 or a
  // non-regular state means the league is past Week 17 and inside the rulebook
  // offseason window, which lasts until the next Week 1 kickoff.
  return Number(week || 0) > 17;
}''',
    )
    replace_regex(
        validator_path,
        r"function toVia\(tx: SleeperTransaction\['type'\] \| string\): 'free_agent' \| 'waiver' \| 'trade' \| 'draft' \| 'other' \{.*?\n\}",
        r'''function toVia(tx: SleeperTransaction['type'] | string): 'free_agent' | 'trade' | 'draft' | 'other' {
  if (tx === 'free_agent' || tx === 'waiver') return 'free_agent';
  if (tx === 'trade') return 'trade';
  if (tx === 'draft') return 'draft';
  return 'other';
}

function isSundayInEasternTime(timestamp: number): boolean {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(new Date(timestamp));
  return weekday === 'Sun';
}''',
    )
    replace_once(
        validator_path,
        "export type Violation = { code: 'too_many_on_taxi' | 'too_many_qbs' | 'invalid_intake' | 'boomerang_active_player' | 'boomerang_reset_ineligible' | 'roster_inconsistent'; detail?: string; players?: string[] };",
        "export type Violation = { code: 'too_many_on_taxi' | 'too_many_qbs' | 'invalid_intake' | 'late_taxi_placement' | 'boomerang_active_player' | 'boomerang_reset_ineligible' | 'roster_inconsistent'; detail?: string; players?: string[] };",
    )
    replace_once(
        validator_path,
        "  let currentWeek = 0;\n  try {\n    const st = await getNFLState();\n    const wk = Number((st as { week?: number }).week || 0) || 0;\n    currentWeek = wk;\n  } catch {}",
        "  let currentWeek = 0;\n  let currentSeasonType = '';\n  try {\n    const st = await getNFLState();\n    const typedState = st as { week?: number; season_type?: string };\n    currentWeek = Number(typedState.week || 0) || 0;\n    currentSeasonType = String(typedState.season_type || '');\n  } catch {}",
    )
    replace_once(
        validator_path,
        "      currentWeek = Number((st2 as { week?: number }).week || 0) || 0;",
        "      const typedState = st2 as { week?: number; season_type?: string };\n      currentWeek = Number(typedState.week || 0) || 0;\n      currentSeasonType = String(typedState.season_type || currentSeasonType);",
    )
    replace_once(
        validator_path,
        "  const inOffseason = isInOffseason();",
        "  const inOffseason = isInOffseason(currentSeasonType, currentWeek);",
    )
    replace_once(
        validator_path,
        "  const invalidIntake: string[] = [];\n  const boomerang: string[] = [];",
        "  const invalidIntake: string[] = [];\n  const lateTaxiPlacement: string[] = [];\n  const boomerang: string[] = [];",
    )
    replace_once(
        validator_path,
        "    if (lj && !['free_agent', 'waiver', 'trade', 'draft'].includes(lj.via)) invalidIntake.push(pid);",
        "    if (lj && !['free_agent', 'trade', 'draft'].includes(lj.via)) invalidIntake.push(pid);\n    if (lj && currentWeek > 0 && lj.week === currentWeek && isSundayInEasternTime(lj.ts)) {\n      lateTaxiPlacement.push(pid);\n    }",
    )
    replace_once(
        validator_path,
        "  if (invalidIntake.length > 0) violations.push({ code: 'invalid_intake', detail: 'Taxi intake must be FA/Trade/Draft', players: invalidIntake });",
        "  if (invalidIntake.length > 0) violations.push({ code: 'invalid_intake', detail: 'Taxi intake must be free agency, trade, or Entry Draft', players: invalidIntake });\n  if (lateTaxiPlacement.length > 0) violations.push({ code: 'late_taxi_placement', detail: 'Player acquired and placed on Taxi on Sunday of the current week', players: lateTaxiPlacement });",
    )
    replace_once(
        validator_path,
        "  const hardCodes = new Set<Violation['code']>(['too_many_on_taxi','too_many_qbs','invalid_intake','roster_inconsistent']);\n  const hardViolationCount = violations.filter(v => hardCodes.has(v.code)).length;",
        "  const violationCount = violations.length;",
    )
    replace_once(
        validator_path,
        "    compliant: hardViolationCount === 0,",
        "    compliant: violationCount === 0,",
    )

    # ------------------------------------------------------------------
    # Stored flags now expose coverage/degraded status and every current taxi
    # rule code. Incomplete runs can no longer display a false all-clear.
    # ------------------------------------------------------------------
    write_file(
        'src/app/api/taxi/flags/route.ts',
        r'''import { getLatestTaxiRunMeta, getTaxiSnapshotsForRun } from '@/server/db/queries';
import { getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Flag = { team: string; type: 'violation' | 'warning'; message: string };
type StoredViolation = { code: string; detail?: string; players?: string[] };
type SnapshotRow = {
  teamId: string;
  compliant: number | boolean;
  violations: StoredViolation[];
  degraded?: number | boolean;
};

function playerNames(ids: string[] | undefined, nameOf: (id: string) => string): string {
  return (ids || []).map(nameOf).slice(0, 4).join(', ');
}

function describeViolation(violation: StoredViolation, nameOf: (id: string) => string): string | null {
  const names = playerNames(violation.players, nameOf);
  if (violation.code === 'too_many_on_taxi') return 'More than four players on Taxi';
  if (violation.code === 'too_many_qbs') return 'More than one quarterback on Taxi';
  if (violation.code === 'invalid_intake') return `Taxi intake was not free agency, trade, or Entry Draft${names ? `: ${names}` : ''}`;
  if (violation.code === 'late_taxi_placement') return `Player was acquired and placed on Taxi on Sunday${names ? `: ${names}` : ''}`;
  if (violation.code === 'boomerang_active_player') return `Previously activated during the current tenure and returned to Taxi${names ? `: ${names}` : ''}`;
  if (violation.code === 'boomerang_reset_ineligible') return `Previously activated player is not eligible for the offseason reset${names ? `: ${names}` : ''}`;
  if (violation.code === 'roster_inconsistent') return 'Taxi roster conflicts with another roster bucket';
  return violation.detail || null;
}

export async function GET() {
  let meta: { season: number; week: number; runType: string; runTs?: Date } | null = null;
  try {
    meta = await getLatestTaxiRunMeta();
  } catch {
    meta = null;
  }

  if (!meta) {
    const timestamp = new Date().toISOString();
    return Response.json({
      generatedAt: timestamp,
      lastRunAt: timestamp,
      actual: [],
      potential: [],
      complete: false,
      degraded: false,
      checkedTeams: 0,
      expectedTeams: TEAM_NAMES.length,
    });
  }

  try {
    const rows = await getTaxiSnapshotsForRun({
      season: meta.season,
      week: meta.week,
      runType: meta.runType as 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | 'admin_rerun',
    }).catch(() => [] as SnapshotRow[]) as SnapshotRow[];

    const players = await getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string }>));
    const nameOf = (playerId: string) => {
      const player = players[playerId];
      if (!player) return playerId;
      return `${player.first_name || ''} ${player.last_name || ''}`.trim() || playerId;
    };

    const actual: Flag[] = [];
    const potential: Flag[] = [];
    const isOfficial = meta.runType === 'sun_pm_official';
    const degradedRows = rows.filter((row) => row.degraded === true || Number(row.degraded || 0) === 1);
    const checkedRows = rows.filter((row) => !degradedRows.includes(row));

    for (const row of checkedRows) {
      const descriptions = (Array.isArray(row.violations) ? row.violations : [])
        .map((violation) => describeViolation(violation, nameOf))
        .filter((value): value is string => Boolean(value));
      if (descriptions.length === 0) continue;

      const nonCompliant = row.compliant === false || Number(row.compliant) === 0;
      const toActual = isOfficial && nonCompliant;
      const target = toActual ? actual : potential;
      target.push({
        team: row.teamId,
        type: toActual ? 'violation' : 'warning',
        message: `${row.teamId}: ${descriptions.join('; ')}`,
      });
    }

    const expectedTeams = TEAM_NAMES.length;
    const complete = rows.length >= expectedTeams && degradedRows.length === 0;
    return Response.json({
      generatedAt: new Date().toISOString(),
      lastRunAt: meta.runTs ? meta.runTs.toISOString() : new Date().toISOString(),
      runType: meta.runType,
      season: meta.season,
      week: meta.week,
      actual,
      potential,
      complete,
      degraded: degradedRows.length > 0,
      checkedTeams: checkedRows.length,
      expectedTeams,
    });
  } catch {
    const timestamp = new Date().toISOString();
    return Response.json({
      generatedAt: timestamp,
      lastRunAt: timestamp,
      actual: [],
      potential: [],
      complete: false,
      degraded: true,
      checkedTeams: 0,
      expectedTeams: TEAM_NAMES.length,
    });
  }
}
''',
    )

    # ------------------------------------------------------------------
    # The homepage's explicit audit button runs a fresh full validation and
    # records it as an admin rerun. Manual checks never masquerade as official
    # Sunday enforcement runs.
    # ------------------------------------------------------------------
    write_file(
        'src/app/api/taxi/report/route.ts',
        r'''import { getNFLState, getTeamsData, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS, TEAM_NAMES } from '@/lib/constants/league';
import { writeTaxiSnapshot } from '@/server/db/queries.fixed';
import { validateTaxiForRoster, type Violation } from '@/lib/server/taxi-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Flag = { team: string; type: 'warning'; message: string };

function describeViolation(violation: Violation, nameOf: (id: string) => string): string | null {
  const names = (violation.players || []).map(nameOf).slice(0, 4).join(', ');
  if (violation.code === 'too_many_on_taxi') return 'More than four players on Taxi';
  if (violation.code === 'too_many_qbs') return 'More than one quarterback on Taxi';
  if (violation.code === 'invalid_intake') return `Taxi intake was not free agency, trade, or Entry Draft${names ? `: ${names}` : ''}`;
  if (violation.code === 'late_taxi_placement') return `Player was acquired and placed on Taxi on Sunday${names ? `: ${names}` : ''}`;
  if (violation.code === 'boomerang_active_player') return `Previously activated during the current tenure and returned to Taxi${names ? `: ${names}` : ''}`;
  if (violation.code === 'boomerang_reset_ineligible') return `Previously activated player is not eligible for the offseason reset${names ? `: ${names}` : ''}`;
  if (violation.code === 'roster_inconsistent') return 'Taxi roster conflicts with another roster bucket';
  return violation.detail || null;
}

export async function GET() {
  const now = new Date();
  const runType = 'admin_rerun' as const;
  try {
    const state = await getNFLState().catch(() => ({ season: new Date().getFullYear(), week: 1 } as { season?: number; week?: number }));
    const season = Number(state.season || new Date().getFullYear());
    const week = Number(state.week || 1);
    const teams = await getTeamsData(LEAGUE_IDS.CURRENT).catch(() => [] as Array<{ teamName: string; rosterId: number }>);
    const players = await getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string }>));
    const nameOf = (playerId: string) => {
      const player = players[playerId];
      return player ? (`${player.first_name || ''} ${player.last_name || ''}`.trim() || playerId) : playerId;
    };

    const potential: Flag[] = [];
    let checkedTeams = 0;
    let degraded = teams.length < TEAM_NAMES.length;

    for (const team of teams) {
      try {
        const result = await validateTaxiForRoster(String(season), team.rosterId);
        if (!result) throw new Error('validation_unavailable');
        const descriptions = result.violations
          .map((violation) => describeViolation(violation, nameOf))
          .filter((value): value is string => Boolean(value));

        if (descriptions.length > 0) {
          potential.push({
            team: team.teamName,
            type: 'warning',
            message: `${team.teamName}: ${descriptions.join('; ')}`,
          });
        }

        await writeTaxiSnapshot({
          season,
          week,
          runType,
          runTs: now,
          teamId: team.teamName,
          taxiIds: result.current.taxi.map((player) => player.playerId),
          compliant: result.compliant,
          violations: result.violations,
          degraded: false,
        });
        checkedTeams += 1;
      } catch {
        degraded = true;
        await writeTaxiSnapshot({
          season,
          week,
          runType,
          runTs: now,
          teamId: team.teamName,
          taxiIds: [],
          compliant: true,
          violations: [],
          degraded: true,
        }).catch(() => null);
      }
    }

    const expectedTeams = TEAM_NAMES.length;
    return Response.json({
      generatedAt: now.toISOString(),
      lastRunAt: now.toISOString(),
      runType,
      season,
      week,
      actual: [],
      potential,
      complete: checkedTeams === expectedTeams && !degraded,
      degraded,
      checkedTeams,
      expectedTeams,
    });
  } catch {
    return Response.json({
      generatedAt: now.toISOString(),
      lastRunAt: now.toISOString(),
      actual: [],
      potential: [],
      complete: false,
      degraded: true,
      checkedTeams: 0,
      expectedTeams: TEAM_NAMES.length,
    }, { status: 500 });
  }
}
''',
    )

    # GitHub Actions is scheduled at the top of each hour but may begin several
    # minutes late. Accept the full target hour so named warning/official audits
    # are not silently downgraded to tracking-only runs.
    cron_path = 'src/app/api/taxi/cron/route.ts'
    replace_regex(
        cron_path,
        r"function pickRunType\(day: string, hour: number, minute: number\): 'wed_warn' \| 'thu_warn' \| 'sun_am_warn' \| 'sun_pm_official' \| null \{.*?\n\}",
        r'''function pickRunType(day: string, hour: number, _minute: number): 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | null {
  if (day === 'Wed' && hour === 17) return 'wed_warn';
  if (day === 'Thu' && hour === 15) return 'thu_warn';
  if (day === 'Sun' && hour === 11) return 'sun_am_warn';
  if (day === 'Sun' && hour === 20) return 'sun_pm_official';
  return null;
}''',
    )

    STAMP.write_text('applied\n', encoding='utf-8')
    print('[home-taxi-update] Homepage order, styling, and taxi rules update applied.')


if __name__ == '__main__':
    main()
