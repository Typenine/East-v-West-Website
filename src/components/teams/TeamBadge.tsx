"use client";

import Image from "next/image";
import { getTeamLogoPath, getTeamColorStyle } from "@/lib/utils/team-utils";
import { cn } from "@/lib/utils/cn";

export default function TeamBadge({
  team,
  size = "sm",
  showName = true,
  className,
}: {
  team: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  className?: string;
}) {
  const px = size === "lg" ? 40 : size === "md" ? 28 : 20;
  const logo = getTeamLogoPath(team);
  const style = getTeamColorStyle(team, "primary");

  const initials = team
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="flex items-center justify-center rounded-full overflow-hidden border border-[var(--border)]"
        style={{ width: px, height: px, ...style }}
      >
        {/* Prefer image; fallback shows initials with team color */}
        <Image
          src={logo}
          alt={`${team} logo`}
          width={px}
          height={px}
          className="object-contain"
          onError={(e) => {
            // Hide image if not found; keep colored circle with initials
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-[10px] font-bold leading-none select-none">{initials}</span>
      </div>
      {showName && <span className="truncate max-w-[14rem]">{team}</span>}
    </div>
  );
}
