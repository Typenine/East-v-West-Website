"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export default function GroupedToolbar({
  seasons,
  teams,
}: {
  seasons: string[];
  teams: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const season = searchParams.get("season") || "all";
  const team = searchParams.get("team") || "all";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key); else params.set(key, value);
    const qs = params.toString();
    router.push(`/transactions${qs ? `?${qs}` : ""}`);
  }

  const seasonOptions = ["all", ...seasons];
  const teamOptions = ["all", ...teams];

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
    </div>
  );
}
