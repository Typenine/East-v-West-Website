import type { LeagueTransaction } from '@/lib/utils/transactions';
import TransactionCard from '@/components/transactions/TransactionCard';
import { BroadcastPanel, broadcastMutedTextStyle, teamAccent } from '@/components/ui/BroadcastPanel';

export default function GroupedByYear({ data }: { data: LeagueTransaction[] }) {
  const bySeason = new Map<string, LeagueTransaction[]>();
  for (const txn of data) {
    const arr = bySeason.get(txn.season) || [];
    arr.push(txn);
    bySeason.set(txn.season, arr);
  }
  const seasons = Array.from(bySeason.keys()).sort((a, b) => b.localeCompare(a));

  if (seasons.length === 0) {
    return (
      <div className="py-10 text-center text-sm" style={broadcastMutedTextStyle}>
        No transactions.
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {seasons.map((season) => {
        const items = (bySeason.get(season) || []).slice().sort((a, b) => b.created - a.created);
        const totalFaab = items.reduce((sum, t) => sum + (t.faab || 0), 0);
        return (
          <BroadcastPanel
            key={season}
            accent={teamAccent(items[0]?.team)}
            title={`Season ${season}`}
            meta={`${items.length} moves · $${totalFaab} FAAB`}
            bodyClassName="!px-4 !py-4 sm:!px-5 space-y-4"
          >
            {items.map((txn) => (
              <TransactionCard key={`${txn.id}-${txn.type}-${txn.rosterId}`} txn={txn} />
            ))}
          </BroadcastPanel>
        );
      })}
    </div>
  );
}
