export default function StatsLoading() {
  return (
    <div className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="h-4 w-28 animate-pulse rounded bg-[var(--surface-strong)]" />
      <div className="mt-4 border-b-4 border-[var(--accent)] pb-4">
        <div className="h-3 w-40 animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="mt-3 h-10 w-72 max-w-full animate-pulse rounded bg-[var(--surface-strong)]" />
        <div className="mt-3 h-4 w-[36rem] max-w-full animate-pulse rounded bg-[var(--surface-strong)]" />
      </div>
      <div className="mt-5 flex gap-2 overflow-hidden border-b border-[var(--border)] pb-3">
        {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-8 w-24 shrink-0 animate-pulse rounded bg-[var(--surface-strong)]" />)}
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="h-6 w-44 animate-pulse rounded bg-[var(--surface-strong)]" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 7 }, (_, row) => <div key={row} className="h-8 animate-pulse rounded bg-[var(--surface-strong)]" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
