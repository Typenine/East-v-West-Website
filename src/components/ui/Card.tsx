import { HTMLAttributes, PropsWithChildren } from "react";
import classNames from "classnames";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={classNames(
        "evw-surface border border-[var(--border)] rounded-[var(--radius-card)] shadow-[var(--shadow-soft)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("px-4 py-3 border-b border-[var(--border)]", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={classNames("text-base font-semibold text-[var(--text)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("p-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames("px-4 py-3 border-t border-[var(--border)]", className)} {...props} />;
}

export default Card;
