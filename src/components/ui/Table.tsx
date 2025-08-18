import { HTMLAttributes } from "react";
import classNames from "classnames";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={classNames(
        "w-full text-left border-collapse [&_th]:text-[var(--muted)] [&_th]:font-medium [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide",
        "[&_th,td]:px-3 [&_th,td]:py-2",
        className
      )}
      {...props}
    />
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={classNames("border-b border-[var(--border)]", className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={classNames("[&_tr]:border-b [&_tr]:border-[var(--border)]", className)} {...props} />;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={classNames("hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]", className)} {...props} />;
}

export function Th({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <th className={classNames("text-[var(--muted)]", className)} {...props} />;
}

export function Td({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={classNames("text-[var(--text)]", className)} {...props} />;
}

export default Table;
