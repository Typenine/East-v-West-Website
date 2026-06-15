'use client';

export function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; dot: string }> = {
    draft: { bg: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/25', dot: 'bg-zinc-400' },
    open: { bg: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25', dot: 'bg-emerald-400' },
    closed: { bg: 'bg-slate-500/15 text-slate-400 border border-slate-500/25', dot: 'bg-slate-400' },
    pending: { bg: 'bg-amber-500/15 text-amber-400 border border-amber-500/25', dot: 'bg-amber-400' },
  };
  const { bg, dot } = cfg[status] ?? cfg.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${status === 'open' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

export function AlertBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-3 text-sm text-red-400">
      <span className="mt-0.5 shrink-0">⚠</span>
      <span className="flex-1 leading-snug">{msg}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 opacity-50 hover:opacity-100 text-xs mt-0.5">
        ✕
      </button>
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{value} of {max} voted</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-strong)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SectionBlock({
  title,
  description,
  children,
  optional,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 bg-[var(--surface-strong)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
          {optional ? (
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">Optional</span>
          ) : null}
        </div>
        {description ? <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p> : null}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}
