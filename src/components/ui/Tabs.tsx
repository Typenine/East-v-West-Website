"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Chip } from "@/components/ui/Chip";

export type Tab = { id: string; label: string; content: ReactNode };

export function Tabs({
  tabs,
  initialId,
  activeId,
  onChange,
  /** When true, avoid mounting all tab panels up front. */
  lazyPanels = false,
  /** With lazy panels, keep mounted content after first visit to preserve state. */
  lazyMode = "unmount-inactive",
}: {
  tabs: Tab[];
  initialId?: string;
  activeId?: string;
  onChange?: (id: string) => void;
  lazyPanels?: boolean;
  lazyMode?: "unmount-inactive" | "mount-once";
}) {
  const pathname = usePathname();
  const teamPageMatch = pathname?.match(/^\/teams\/(\d+)$/);
  const teamHealthHref = teamPageMatch ? `/teams/${teamPageMatch[1]}/health` : null;
  const fallbackId = useMemo(() => tabs[0]?.id, [tabs]);
  const [internalActive, setInternalActive] = useState(initialId ?? fallbackId);
  const [visited, setVisited] = useState<Record<string, boolean>>(() => {
    const first = initialId ?? fallbackId;
    return first ? { [first]: true } : {};
  });

  useEffect(() => {
    if (activeId !== undefined) return;
    setInternalActive(initialId ?? fallbackId);
  }, [activeId, initialId, fallbackId]);

  const active = activeId ?? internalActive;

  useEffect(() => {
    if (!active || !lazyPanels || lazyMode !== "mount-once") return;
    setVisited((prev) => (prev[active] ? prev : { ...prev, [active]: true }));
  }, [active, lazyPanels, lazyMode]);

  const setActive = (id: string) => {
    if (activeId === undefined) setInternalActive(id);
    onChange?.(id);
  };

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-2 mb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((t) => (
          <Chip
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            selected={active === t.id}
            variant="accent"
            size="md"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </Chip>
        ))}
        {teamHealthHref && (
          <Link
            href={teamHealthHref}
            role="tab"
            aria-selected="false"
            className="inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-sm whitespace-nowrap pill pill-hover text-[var(--muted)] transition-colors"
          >
            Health
          </Link>
        )}
      </div>
      <div>
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`panel-${t.id}`}
            aria-labelledby={`tab-${t.id}`}
            hidden={active !== t.id}
          >
            {!lazyPanels || active === t.id || (lazyMode === "mount-once" && visited[t.id]) ? t.content : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Tabs;
