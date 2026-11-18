"use client";

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
  admin_rerun: "Latest daily or commissioner audit",
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

  // Eastern calendar day matches the league's enforcement time zone.
  const dayET = (date: Date) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const part = (type: string) => parts.find((value) => value.type === type)?.value || "";
    return [part("year"), part("month"), part("day")].join("-");
  };

  const loadLatest = useCallback(async (): Promise<Partial<TaxiFlags> | null> => {
    try {
      const response = await fetch("/api/taxi/flags", { cache: "no-store" });
      if (!response.ok) return null;
      const payload = (await response.json()) as Partial<TaxiFlags>;
      applyPayload(payload);
      return payload;
    } catch {
      // Never clear an existing report if refreshing the saved snapshot fails.
      return null;
    }
  }, [applyPayload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadLatest();
      if (cancelled || !saved) return;
      const mostRecent = saved.runType ? saved.lastRunAt || saved.generatedAt : undefined;
      if (mostRecent && dayET(new Date(mostRecent)) === dayET(new Date())) return;

      // This is NOT a scheduled job. The first homepage view on a day can
      // claim one audit through a database gate. Other views reuse the saved data.
      setLoading(true);
      try {
        const response = await fetch("/api/taxi/daily", { method: "POST", cache: "no-store" });
        if (response.ok) {
          const result = (await response.json()) as { refreshed?: boolean };
          if (!cancelled && result.refreshed) await loadLatest();
        }
      } catch {
        // Preserve yesterday's report when the on-demand refresh is unavailable.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadLatest]);

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
              No scheduled audit has been recorded yet. The next daily audit will appear here.
            </div>
          )}

          <div className="text-[10px] leading-relaxed" style={broadcastFaintTextStyle}>
            The tracker verifies capacity, quarterback limits, permitted acquisition methods, current-tenure activation restrictions, eligible offseason resets, and Sunday acquisition timing. Managers remain responsible for compliance under Rule 5.5(f).
          </div>
        </div>
      </BroadcastPanel>
    </section>
  );
}
