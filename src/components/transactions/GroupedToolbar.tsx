"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export default function GroupedToolbar({
  seasons,
  teams,
  positions,
}: {
  seasons: string[];
  teams: string[];
  positions?: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const season = searchParams.get("season") || "all";
  const team = searchParams.get("team") || "all";
  const week = searchParams.get("week") || "all";
  const position = searchParams.get("position") || "all";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key); else params.set(key, value);
    // Reset pagination when filters change
    if (["season", "team", "week", "position"].includes(key)) {
      params.delete("page");
    }
    const qs = params.toString();
    router.push(`/transactions${qs ? `?${qs}` : ""}`);
  }

  const seasonOptions = ["all", ...seasons];
  const teamOptions = ["all", ...teams];
  const weekOptions = ["all", ...Array.from({ length: 18 }, (_, i) => String(i + 1))];
  const positionOptions = ["all", ...((positions ?? []) as string[])];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 p-3 evw-surface border border-[var(--border)] rounded">
      <div className="flex items-center gap-2">
        <label htmlFor="group-season" className="text-xs text-[var(--muted)]">Season</label>
        <select
          id="group-season"
          className={cn("evw-surface border border-[var(--border)] rounded px-2 py-1 text-sm")}
          value={season}
          onChange={(e) => updateParam("season", e.target.value)}
        >
          {seasonOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All seasons" : opt}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="group-team" className="text-xs text-[var(--muted)]">Team</label>
        <select
          id="group-team"
          className={cn("evw-surface border border-[var(--border)] rounded px-2 py-1 text-sm")}
          value={team}
          onChange={(e) => updateParam("team", e.target.value)}
        >
          {teamOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All teams" : opt}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="group-week" className="text-xs text-[var(--muted)]">Week</label>
        <select
          id="group-week"
          className={cn("evw-surface border border-[var(--border)] rounded px-2 py-1 text-sm")}
          value={week}
          onChange={(e) => updateParam("week", e.target.value)}
        >
          {weekOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All weeks" : `Week ${opt}`}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="group-position" className="text-xs text-[var(--muted)]">Position</label>
        <select
          id="group-position"
          className={cn("evw-surface border border-[var(--border)] rounded px-2 py-1 text-sm")}
          value={position}
          onChange={(e) => updateParam("position", e.target.value)}
        >
          {positionOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All positions" : opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
