"use client";

import { ReactNode, useState } from "react";
import { Chip } from "@/components/ui/Chip";

export type Tab = { id: string; label: string; content: ReactNode };

export function Tabs({ tabs, initialId }: { tabs: Tab[]; initialId?: string }) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id);

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
