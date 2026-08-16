import { useMemo } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import SectionHeader from '@/components/ui/SectionHeader';
import Chip from '@/components/ui/Chip';
import { getTeamColorStyle } from '@/lib/utils/team-utils';
import type { PlayerProfile } from '@/lib/types/player';

export default function PlayerGameLogSection({ profile }: { profile: PlayerProfile }) {
  const rows = useMemo(() => {
    const ordered = [...profile.weeklyHistory]
      .filter((row) => row.rostered || row.points !== 0 || row.started)
      .sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week);

    const running = new Map<string, number>();
    const withTotals = ordered.map((row) => {
      const next = Number(((running.get(row.season) || 0) + row.points).toFixed(2));
      running.set(row.season, next);
      return { ...row, seasonTotal: next };
    });

    return withTotals.sort((a, b) => b.season.localeCompare(a.season) || b.week - a.week);
  }, [profile.weeklyHistory]);

  return (
    <section>
      <SectionHeader
        title="East v. West Game Log"
        subtitle="Week-by-week production while rostered by an East v. West franchise. Season total is cumulative through that week."
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Season</Th>
                <Th>Week</Th>
                <Th>Franchise</Th>
                <Th>Role</Th>
                <Th>Points</Th>
                <Th>Season Total</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <Tr><Td colSpan={6} className="text-[var(--muted)]">No East v. West weekly game-log data available.</Td></Tr>
              )}
              {rows.map((row) => (
                <Tr key={`${row.season}-${row.week}-${row.rosterId ?? 'none'}`}>
                  <Td>{row.season}</Td>
                  <Td>{row.week}</Td>
                  <Td>
                    {row.franchiseName ? (
                      <Chip style={getTeamColorStyle(row.franchiseName, 'primary')}>{row.franchiseName}</Chip>
                    ) : '—'}
                  </Td>
                  <Td>{row.started ? 'Starter' : row.rostered ? 'Bench' : 'Not rostered'}</Td>
                  <Td className="font-semibold tabular-nums">{row.points.toFixed(1)}</Td>
                  <Td className="tabular-nums">{row.seasonTotal.toFixed(1)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
