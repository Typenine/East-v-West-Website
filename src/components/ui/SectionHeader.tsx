import { HTMLAttributes, ReactNode } from "react";
import classNames from "classnames";

export default function SectionHeader({
  title,
  subtitle,
  actions,
  className,
  ...props
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classNames("flex items-end justify-between gap-3 mb-3", className)} {...props}>
      <div>
        <h2 className="text-xl font-semibold text-[var(--text)] flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 rounded-full bg-[var(--accent)]" />
          {title}
        </h2>
        {subtitle && <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
