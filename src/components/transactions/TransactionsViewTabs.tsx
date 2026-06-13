"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui/Chip";

export default function TransactionsViewTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") || "all").toLowerCase();

  function setView(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "all") params.delete("view");
    else params.set("view", v);
    const qs = params.toString();
    router.push(`/transactions${qs ? `?${qs}` : ""}`);
  }

  const tabs = [
    { key: "all", label: "All" },
    { key: "year", label: "By Year" },
    { key: "team", label: "By Team" },
  ];

  return (
    <div className="mt-4 flex gap-2" role="tablist" aria-orientation="horizontal">
      {tabs.map((t) => (
        <Chip
          key={t.key}
          role="tab"
          aria-selected={view === t.key}
          selected={view === t.key}
          onClick={() => setView(t.key)}
        >
          {t.label}
        </Chip>
      ))}
    </div>
  );
}
