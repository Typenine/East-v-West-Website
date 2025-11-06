"use client";
import { useEffect, useState, useCallback } from "react";

type Flag = { team: string; type: string; message: string };
export type TaxiFlags = {
  generatedAt: string;
  lastRunAt?: string;
  runType?: string;
  season?: number;
  week?: number;
  actual: Flag[];
  potential: Flag[];
};

export default function TaxiBanner({ initial }: { initial: TaxiFlags }) {
  const [flags, setFlags] = useState<TaxiFlags>(initial);
  const [loading, setLoading] = useState(false);

  const refreshFlags = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/taxi/flags", { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as Partial<TaxiFlags>;
        setFlags((prev) => ({
          generatedAt: j.generatedAt || prev.generatedAt || new Date().toISOString(),
          lastRunAt: j.lastRunAt || prev.lastRunAt,
          runType: j.runType || prev.runType,
          season: j.season ?? prev.season,
          week: j.week ?? prev.week,
          actual: Array.isArray(j.actual) ? j.actual : prev.actual || [],
          potential: Array.isArray(j.potential) ? j.potential : prev.potential || [],
        }));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Post-hydration refresh to pick up latest snapshots without blocking SSR
    refreshFlags();
  }, [refreshFlags]);

  const dt = new Date(flags.lastRunAt || flags.generatedAt || new Date().toISOString());
  const tsET = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(dt);

  return (
    <section className="mb-6" aria-label="Taxi tracker summary">
      {flags.actual.length > 0 && (
        <div className="mb-2 evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold">Taxi violations</div>
            <button className="text-xs underline opacity-80" onClick={refreshFlags} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
          <div className="text-xs opacity-80 mb-1">Run: {flags.runType || "—"} • Last run at: {tsET} ET</div>
          <ul className="list-disc pl-5 text-sm">
            {flags.actual.slice(0, 3).map((f, i) => (
              <li key={`act-${i}`}>{f.message}</li>
            ))}
            {flags.actual.length > 3 && <li className="opacity-80">+{flags.actual.length - 3} more…</li>}
          </ul>
        </div>
      )}

      {flags.potential.length > 0 && (
        <div className="evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold">Potential taxi issues (pending games)</div>
            <button className="text-xs underline opacity-80" onClick={refreshFlags} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
          <div className="text-xs opacity-80 mb-1">Run: {flags.runType || "—"} • Last run at: {tsET} ET</div>
          <ul className="list-disc pl-5 text-sm">
            {flags.potential.slice(0, 3).map((f, i) => (
              <li key={`pot-${i}`}>{f.message}</li>
            ))}
            {flags.potential.length > 3 && <li className="opacity-80">+{flags.potential.length - 3} more…</li>}
          </ul>
        </div>
      )}

      {flags.actual.length === 0 && flags.potential.length === 0 && flags.runType && (
        <div className="evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: "color-mix(in srgb, #10b981 12%, transparent)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold">All teams compliant</div>
            <button className="text-xs underline opacity-80" onClick={refreshFlags} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
          <div className="text-sm">As of {tsET} ET (run: {flags.runType}).</div>
        </div>
      )}

      {flags.actual.length === 0 && flags.potential.length === 0 && !flags.runType && (
        <div className="evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: "color-mix(in srgb, #93c5fd 12%, transparent)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold">Taxi tracker</div>
            <button className="text-xs underline opacity-80" onClick={refreshFlags} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
          <div className="text-sm">No scheduled report recorded yet.</div>
          <div className="text-xs opacity-80">Last checked: {new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(flags.generatedAt || new Date().toISOString()))} ET</div>
        </div>
      )}
    </section>
  );
}
