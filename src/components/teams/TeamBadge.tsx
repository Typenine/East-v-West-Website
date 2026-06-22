"use client";

import Image from "next/image";
import { useState } from "react";
import { getTeamLogoPath, getTeamColorStyle, getTeamColors } from "@/lib/utils/team-utils";
import { cn } from "@/lib/utils/cn";

export default function TeamBadge({
  team,
  size = "md",
  showName = true,
  className,
}: {
  team: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  className?: string;
}) {
  const [imgOk, setImgOk] = useState(true);
  const px = size === "lg" ? 40 : size === "md" ? 28 : 20;
  const logo = getTeamLogoPath(team);
  const style = getTeamColorStyle(team, "primary");
  const colors = getTeamColors(team);

  const initials = team
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="flex items-center justify-center rounded-full overflow-hidden border"
        style={{ width: px, height: px, borderColor: colors.secondary, ...style }}
      >
        {/* Prefer image; fallback shows initials with team color */}
        {imgOk ? (
          <Image
            src={logo}
            alt={`${team} logo`}
            width={px}
            height={px}
            className="object-contain"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span className="text-[10px] font-bold leading-none select-none">{initials}</span>
        )}
      </div>
      {showName && (
        <span
          className="truncate max-w-[14rem] px-2 py-0.5 rounded"
          style={{ backgroundColor: colors.secondary + '22' }}
        >
          {team}
        </span>
      )}
    </div>
  );
}
