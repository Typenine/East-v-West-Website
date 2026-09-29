export default function PlayoffLabLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="h-8 w-52 animate-pulse rounded bg-white/10" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-white/5" />

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-white/[0.03]" />
        ))}
      </div>

      <div className="mt-5 space-y-3 rounded-xl border border-[var(--border)] p-4">
        <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
