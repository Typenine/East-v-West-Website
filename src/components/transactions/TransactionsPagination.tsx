"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  PANEL,
  broadcastFieldClass,
  broadcastFieldStyle,
  broadcastMutedTextStyle,
  broadcastBodyTextStyle,
  broadcastChipButtonClass,
} from "@/components/ui/BroadcastPanel";

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
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
      style={{ borderTop: `1px solid ${PANEL.hairline}`, background: PANEL.headerBg }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={broadcastChipButtonClass(false)}
          onClick={() => goto(current - 1)}
          disabled={current <= 1}
          style={current <= 1 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          Prev
        </button>
        <div className="text-sm" style={broadcastBodyTextStyle}>
          Page <span className="font-medium">{current}</span> of{" "}
          <span className="font-medium">{totalPages}</span>
        </div>
        <button
          type="button"
          className={broadcastChipButtonClass(false)}
          onClick={() => goto(current + 1)}
          disabled={current >= totalPages}
          style={current >= totalPages ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          Next
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="per-page" className="text-xs uppercase tracking-wider" style={broadcastMutedTextStyle}>
          Rows per page
        </label>
        <select
          id="per-page"
          className={[broadcastFieldClass, "!w-auto"].join(" ")}
          style={broadcastFieldStyle}
          value={perPage}
          onChange={(e) => setPerPage(Number(e.target.value) || 25)}
        >
          {[25, 50, 100, 250].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
