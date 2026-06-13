"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  BroadcastPanel,
  broadcastFieldClass,
  broadcastFieldStyle,
  broadcastLabelClass,
  broadcastFaintTextStyle,
} from "@/components/ui/BroadcastPanel";

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
    if (value === "all") params.delete(key);
    else params.set(key, value);
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
    <BroadcastPanel title="Filters" bodyClassName="!py-3">
      <div className="flex flex-wrap items-end gap-3">
        <ToolbarSelect
          id="group-season"
          label="Season"
          value={season}
          onChange={(value) => updateParam("season", value)}
          options={seasonOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All seasons" : opt,
          }))}
        />
        <ToolbarSelect
          id="group-team"
          label="Team"
          value={team}
          onChange={(value) => updateParam("team", value)}
          options={teamOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All teams" : opt,
          }))}
        />
        <ToolbarSelect
          id="group-week"
          label="Week"
          value={week}
          onChange={(value) => updateParam("week", value)}
          options={weekOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All weeks" : `Week ${opt}`,
          }))}
        />
        <ToolbarSelect
          id="group-position"
          label="Position"
          value={position}
          onChange={(value) => updateParam("position", value)}
          options={positionOptions.map((opt) => ({
            value: opt,
            label: opt === "all" ? "All positions" : opt,
          }))}
        />
      </div>
    </BroadcastPanel>
  );
}

function ToolbarSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className={broadcastLabelClass} style={broadcastFaintTextStyle}>
        {label}
      </span>
      <select
        id={id}
        className={[broadcastFieldClass, "!w-auto"].join(" ")}
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
