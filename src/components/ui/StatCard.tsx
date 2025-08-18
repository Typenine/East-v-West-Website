import Card, { CardContent, CardHeader, CardTitle } from "./Card";
import classNames from "classnames";

export function StatCard({
  label,
  value,
  delta,
  positive,
  icon,
  className,
}: {
  label: string;
  value: string | number;
  delta?: string;
  positive?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm text-[var(--muted)]">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-[var(--text)]">{value}</div>
        {delta && (
          <div
            className={classNames(
              "mt-1 text-sm",
              positive === true && "text-emerald-400",
              positive === false && "text-red-400",
              positive === undefined && "text-[var(--muted)]"
            )}
          >
            {delta}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default StatCard;
