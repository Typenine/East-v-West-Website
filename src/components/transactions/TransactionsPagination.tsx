"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export default function TransactionsPagination({
  total,
  page,
  perPage,
}: {
  total: number;
  page: number;
  perPage: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const current = Math.min(Math.max(1, page), totalPages);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    const qs = params.toString();
    router.push(`/transactions${qs ? `?${qs}` : ""}`);
  }

  function goto(p: number) {
    const clamped = Math.min(Math.max(1, p), totalPages);
    setParam("page", String(clamped));
  }

  function setPerPage(pp: number) {
    setParam("perPage", String(pp));
    setParam("page", "1");
  }

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--border)]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn("px-2 py-1 border rounded text-sm", current <= 1 && "opacity-50 cursor-not-allowed")}
          onClick={() => goto(current - 1)}
          disabled={current <= 1}
        >
          Prev
        </button>
        <div className="text-sm">
          Page <span className="font-medium">{current}</span> of <span className="font-medium">{totalPages}</span>
        </div>
        <button
          type="button"
          className={cn("px-2 py-1 border rounded text-sm", current >= totalPages && "opacity-50 cursor-not-allowed")}
          onClick={() => goto(current + 1)}
          disabled={current >= totalPages}
        >
          Next
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="per-page" className="text-xs text-[var(--muted)]">Rows per page</label>
        <select
          id="per-page"
          className="evw-surface border border-[var(--border)] rounded px-2 py-1 text-sm"
          value={perPage}
          onChange={(e) => setPerPage(Number(e.target.value) || 25)}
        >
          {[25, 50, 100, 250].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
