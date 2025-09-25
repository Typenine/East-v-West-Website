"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { TransactionsSummary } from "@/lib/utils/transactions";

export default function TransactionsFilters({
  summary,
  seasons,
  teams,
}: {
  summary: TransactionsSummary;
  seasons: string[];
  teams: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeSeason = searchParams.get("season") ?? "all";
  const activeTeam = searchParams.get("team") ?? "all";
  const sort = searchParams.get("sort") ?? "created";
  const direction = searchParams.get("direction") ?? "desc";

  const seasonOptions = useMemo(() => ["all", ...seasons], [seasons]);
  const teamOptions = useMemo(() => ["all", ...teams], [teams]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.push(`/transactions${qs ? `?${qs}` : ""}`);
  }

  function handleSort(nextSort: string) {
    const params = new URLSearchParams(searchParams.toString());
    const currentSort = params.get("sort") ?? "created";
    const currentDir = params.get("direction") ?? "desc";
    let nextDir = "desc";
    if (currentSort === nextSort) {
      nextDir = currentDir === "desc" ? "asc" : "desc";
    }
    params.set("sort", nextSort);
    params.set("direction", nextDir);
    const qs = params.toString();
    router.push(`/transactions${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex flex-wrap gap-2">
        <select
          className="evw-surface border border-[var(--border)] rounded px-3 py-2"
          value={activeSeason}
          onChange={(e) => updateParam("season", e.target.value)}
        >
          {seasonOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All seasons" : opt}
            </option>
          ))}
        </select>
        <select
          className="evw-surface border border-[var(--border)] rounded px-3 py-2"
          value={activeTeam}
          onChange={(e) => updateParam("team", e.target.value)}
        >
          {teamOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All teams" : opt}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={clsx(
            "px-3 py-2 rounded border",
            sort === "created" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"
          )}
          onClick={() => handleSort("created")}
        >
          Date {sort === "created" ? `(${direction === "desc" ? "↓" : "↑"})` : ""}
        </button>
        <button
          type="button"
          className={clsx(
            "px-3 py-2 rounded border",
            sort === "faab" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"
          )}
          onClick={() => handleSort("faab")}
        >
          FAAB {sort === "faab" ? `(${direction === "desc" ? "↓" : "↑"})` : ""}
        </button>
        <button
          type="button"
          className={clsx(
            "px-3 py-2 rounded border",
            sort === "team" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"
          )}
          onClick={() => handleSort("team")}
        >
          Team {sort === "team" ? `(${direction === "desc" ? "↓" : "↑"})` : ""}
        </button>
        <button
          type="button"
          className={clsx(
            "px-3 py-2 rounded border",
            sort === "week" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"
          )}
          onClick={() => handleSort("week")}
        >
          Week {sort === "week" ? `(${direction === "desc" ? "↓" : "↑"})` : ""}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard title="Total FAAB Spent" value={`$${summary.totalFaab.toFixed(0)}`} />
        <SummaryCard title="Transactions" value={summary.count.toLocaleString()} />
        <div className="evw-surface border border-[var(--border)] rounded p-3">
          <h3 className="text-sm font-semibold mb-2">Top Spenders</h3>
          {summary.totalsByTeam.length ? (
            <ul className="space-y-1 max-h-40 overflow-auto text-sm">
              {summary.totalsByTeam.slice(0, 10).map((entry) => (
                <li key={entry.team} className="flex justify-between">
                  <span>{entry.team}</span>
                  <span>${entry.faab}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">No FAAB spending yet.</p>
          )}
        </div>
        <div className="evw-surface border border-[var(--border)] rounded p-3 md:col-span-3">
          <h3 className="text-sm font-semibold mb-2">FAAB by Season</h3>
          {summary.totalsBySeason.length ? (
            <div className="flex flex-wrap gap-3 text-sm">
              {summary.totalsBySeason.map((entry) => (
                <div key={entry.season} className="flex items-center gap-2">
                  <span className="font-medium">{entry.season}</span>
                  <span>${entry.faab}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">No FAAB spending recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="evw-surface border border-[var(--border)] rounded p-3">
      <p className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">{title}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
