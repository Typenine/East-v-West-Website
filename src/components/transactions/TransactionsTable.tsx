import type { ReactNode } from "react";
import type { LeagueTransaction } from '@/lib/utils/transactions';
import TransactionCard from '@/components/transactions/TransactionCard';
import { PANEL, broadcastMutedTextStyle } from '@/lib/ui/broadcast-styles';

export default function TransactionsTable({
  data,
}: {
  data: LeagueTransaction[];
  sortKey?: string;
  direction?: 'asc' | 'desc';
}) {
  if (!data.length) {
    return (
      <div className="py-10 text-center text-sm" style={broadcastMutedTextStyle}>
        No transactions match the selected filters.
      </div>
    );
  }

  return (
    <ul className="space-y-5 p-4 sm:p-5">
      {data.map((txn) => (
        <li key={`${txn.id}-${txn.type}-${txn.rosterId}`} className="list-none">
          <TransactionCard txn={txn} />
        </li>
      ))}
    </ul>
  );
}

export function TransactionsTableShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: PANEL.card,
        boxShadow: `inset 0 0 0 1px ${PANEL.border}, 0 4px 18px rgba(0,0,0,0.30)`,
      }}
    >
      {children}
    </div>
  );
}
