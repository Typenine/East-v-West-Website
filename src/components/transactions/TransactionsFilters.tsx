"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TransactionsSummary } from "@/lib/utils/transactions";
import {
  BroadcastPanel,
  PANEL,
  broadcastChipButtonClass,
  broadcastFaintTextStyle,
  broadcastFieldClass,
  broadcastFieldStyle,
  broadcastLabelClass,
  broadcastMutedTextStyle,
  broadcastBodyTextStyle,
} from "@/components/ui/BroadcastPanel";

const selectClass = [broadcastFieldClass, "!w-auto"].join(" ");

export default function TransactionsFilters({
  summary,
  seasons,
  teams,
  positions,
  activeType: activeTypeProp = "all",
}: {
  summary: TransactionsSummary;
  seasons: string[];
  teams: string[];
  positions?: string[];
  activeType?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeSeason = searchParams.get("season") ?? "all";
  const activeTeam = searchParams.get("team") ?? "all";
  const activeWeek = searchParams.get("week") ?? "all";
  const activePosition = searchParams.get("position") ?? "all";
  const activeType = searchParams.get("type") ?? activeTypeProp ?? "fa_waiver";
  const sort = searchParams.get("sort") ?? "created";
  const direction = searchParams.get("direction") ?? "desc";

  const seasonOptions = useMemo(() => ["all", ...seasons], [seasons]);
  const teamOptions = useMemo(() => ["all", ...teams], [teams]);
  const weekOptions = useMemo(() => ["all", ...Array.from({ length: 18 }, (_, i) => String(i + 1))], []);
  const positionOptions = useMemo(() => ["all", ...((positions ?? []) as string[])], [positions]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    if (["season", "team", "week", "position", "type"].includes(key)) {
      params.delete("page");
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
    <BroadcastPanel title="Filters" bodyClassName="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Season"
          value={activeSeason}
          onChange={(value) => updateParam("season", value)}
          options={seasonOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All seasons" : opt,
          }))}
        />
        <FilterSelect
          label="Team"
          value={activeTeam}
          onChange={(value) => updateParam("team", value)}
          options={teamOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All teams" : opt,
          }))}
        />
        <FilterSelect
          label="Week"
          value={activeWeek}
          onChange={(value) => updateParam("week", value)}
          options={weekOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All weeks" : `Week ${opt}`,
          }))}
        />
        <FilterSelect
          label="Position"
          value={activePosition}
          onChange={(value) => updateParam("position", value)}
          options={positionOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All positions" : opt,
          }))}
        />
        <FilterSelect
          label="Type"
          value={activeType}
          onChange={(value) => updateParam("type", value)}
          options={[
            { value: "fa_waiver", label: "FA & Waivers" },
            { value: "all", label: "All types" },
            { value: "waiver", label: "Waivers only" },
            { value: "free_agent", label: "Free Agents only" },
            { value: "trade", label: "Trades only" },
          ]}
        />
        <button
          type="button"
          className={broadcastChipButtonClass(sort === "created")}
          onClick={() => handleSort("created")}
        >
          Date {sort === "created" ? `(${direction === "desc" ? "↓" : "↑"})` : ""}
        </button>
        <button
          type="button"
          className={broadcastChipButtonClass(sort === "faab")}
          onClick={() => handleSort("faab")}
        >
          FAAB {sort === "faab" ? `(${direction === "desc" ? "↓" : "↑"})` : ""}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard title="Total FAAB Spent" value={`$${summary.totalFaab.toFixed(0)}`} />
        <SummaryCard title="Transactions" value={summary.count.toLocaleString()} />
        <div
          className="rounded border p-3"
          style={{ background: PANEL.tintSoft, borderColor: PANEL.hairline }}
        >
          <h3 className={broadcastLabelClass} style={broadcastFaintTextStyle}>
            Top Spenders
          </h3>
          {summary.totalsByTeam.length ? (
            <ul className="space-y-1 max-h-40 overflow-auto text-sm" style={broadcastBodyTextStyle}>
              {summary.totalsByTeam.slice(0, 10).map((entry) => (
                <li key={entry.team} className="flex justify-between gap-3">
                  <span className="truncate">{entry.team}</span>
                  <span className="shrink-0 tabular-nums" style={broadcastMutedTextStyle}>
                    ${entry.faab}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={broadcastMutedTextStyle}>
              No FAAB spending yet.
            </p>
          )}
        </div>
        <div
          className="rounded border p-3 md:col-span-3"
          style={{ background: PANEL.tintSoft, borderColor: PANEL.hairline }}
        >
          <h3 className={broadcastLabelClass} style={broadcastFaintTextStyle}>
            FAAB by Season
          </h3>
          {summary.totalsBySeason.length ? (
            <div className="flex flex-wrap gap-3 text-sm" style={broadcastBodyTextStyle}>
              {summary.totalsBySeason.map((entry) => (
                <div key={entry.season} className="flex items-center gap-2">
                  <span className="font-medium">{entry.season}</span>
                  <span style={broadcastMutedTextStyle}>${entry.faab}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={broadcastMutedTextStyle}>
              No FAAB spending recorded.
            </p>
          )}
        </div>
      </div>
    </BroadcastPanel>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={broadcastLabelClass} style={broadcastFaintTextStyle}>
        {label}
      </span>
      <select
        className={selectClass}
        style={broadcastFieldStyle}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      className="rounded border p-3"
      style={{ background: PANEL.tintSoft, borderColor: PANEL.hairline }}
    >
      <p className={broadcastLabelClass} style={broadcastFaintTextStyle}>
        {title}
      </p>
      <p className="text-lg font-semibold tabular-nums" style={broadcastBodyTextStyle}>
        {value}
      </p>
    </div>
  );
}
