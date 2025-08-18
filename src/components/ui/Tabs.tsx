"use client";

import classNames from "classnames";
import { ReactNode, useState } from "react";

export type Tab = { id: string; label: string; content: ReactNode };

export function Tabs({ tabs, initialId }: { tabs: Tab[]; initialId?: string }) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id);

  return (
    <div className="w-full">
      <div className="flex gap-2 mb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={classNames(
              "px-3 py-1.5 rounded-full text-sm font-medium pill border",
              active === t.id
                ? "pill-active border-transparent"
                : "text-[var(--muted)] hover:text-[var(--text)] pill-hover border-transparent"
            )}
            aria-pressed={active === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tabs.map((t) => (
          <div key={t.id} hidden={active !== t.id}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Tabs;
