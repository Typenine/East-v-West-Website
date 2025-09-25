"use client";

import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";

export default function TransactionsViewTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") || "all").toLowerCase();

  function setView(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "all") params.delete("view"); else params.set("view", v);
    const qs = params.toString();
    router.push(`/transactions${qs ? `?${qs}` : ""}`);
  }

  const tabs = [
    { key: "all", label: "All" },
    { key: "year", label: "By Year" },
    { key: "team", label: "By Team" },
  ];

  return (
    <div className="mt-4 flex gap-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={clsx(
            "px-3 py-2 rounded border text-sm",
            view === t.key ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"
          )}
          onClick={() => setView(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
