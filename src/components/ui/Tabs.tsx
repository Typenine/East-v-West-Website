"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/ui/Chip";

export type Tab = { id: string; label: string; content: ReactNode };

export function Tabs({
  tabs,
  initialId,
  activeId,
  onChange,
}: {
  tabs: Tab[];
  initialId?: string;
  activeId?: string;
  onChange?: (id: string) => void;
}) {
  const fallbackId = useMemo(() => tabs[0]?.id, [tabs]);
  const [internalActive, setInternalActive] = useState(initialId ?? fallbackId);

  useEffect(() => {
    if (activeId !== undefined) return;
    setInternalActive(initialId ?? fallbackId);
  }, [activeId, initialId, fallbackId]);

  const active = activeId ?? internalActive;

  const setActive = (id: string) => {
    if (activeId === undefined) setInternalActive(id);
    onChange?.(id);
  };

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-2 mb-3"
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
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </Chip>
        ))}
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
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Tabs;
