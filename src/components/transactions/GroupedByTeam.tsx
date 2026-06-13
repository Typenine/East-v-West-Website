import type { LeagueTransaction } from '@/lib/utils/transactions';
import TransactionCard from '@/components/transactions/TransactionCard';
import { BroadcastPanel, BroadcastTeamLogo, broadcastMutedTextStyle, teamAccent } from '@/components/ui/BroadcastPanel';

export default function GroupedByTeam({ data }: { data: LeagueTransaction[] }) {
  const byTeam = new Map<string, LeagueTransaction[]>();
  for (const txn of data) {
    if (txn.type === 'trade') {
      for (const tn of txn.teamsInvolved) {
        const arr = byTeam.get(tn) || [];
        arr.push(txn);
        byTeam.set(tn, arr);
      }
      continue;
    }
    const key = txn.team || `Roster ${txn.rosterId}`;
    const arr = byTeam.get(key) || [];
    arr.push(txn);
    byTeam.set(key, arr);
  }
  const teams = Array.from(byTeam.keys()).sort((a, b) => a.localeCompare(b));

  if (teams.length === 0) {
    return (
      <div className="py-10 text-center text-sm" style={broadcastMutedTextStyle}>
        No transactions.
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {teams.map((team) => {
        const items = (byTeam.get(team) || []).slice().sort((a, b) => b.created - a.created);
        const totalFaab = items.reduce((sum, t) => sum + (t.faab || 0), 0);
        const accent = teamAccent(team);
        return (
          <BroadcastPanel
            key={team}
            accent={accent}
            title={team}
            meta={`${items.length} moves · $${totalFaab} FAAB`}
            bodyClassName="!px-4 !py-4 sm:!px-5 space-y-4"
          >
            <div className="flex items-center gap-3 pb-1">
              <BroadcastTeamLogo team={team} accent={accent} />
            </div>
            {items.map((txn) => (
              <TransactionCard key={`${txn.id}-${txn.type}-${txn.rosterId}`} txn={txn} />
            ))}
          </BroadcastPanel>
        );
      })}
    </div>
  );
}
