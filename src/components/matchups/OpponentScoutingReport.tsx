import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { getAllPlayersCached, getLeagueMatchups, type SleeperMatchup, type SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { PlayerAvailabilityEntry } from '@/lib/utils/player-availability';

type TeamInput = {
  name: string;
  rosterId: number;
  starters: string[];
};

type Props = {
  leagueId: string;
  week: number;
  left: TeamInput;
  right: TeamInput;
  availability: Record<string, PlayerAvailabilityEntry>;
};

type PositionKey = 'QB' | 'RB' | 'WR' | 'TE';

type Profile = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  avg: number | null;
  last3: number | null;
  high: number | null;
  low: number | null;
  stdDev: number | null;
  avgMarginInWins: number | null;
  recentForm: string;
  bestPosition: { position: PositionKey; ppg: number } | null;
  flaggedStarters: number;
};

function normalizePosition(position?: string | null): PositionKey | null {
  const value = String(position || '').toUpperCase();
  if (value === 'QB') return 'QB';
  if (value === 'RB' || value === 'HB' || value === 'FB') return 'RB';
  if (value === 'WR') return 'WR';
  if (value === 'TE') return 'TE';
  return null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function buildProfile(
  rosterId: number,
  weeks: SleeperMatchup[][],
  players: Record<string, SleeperPlayer>,
  starters: string[],
  availability: Record<string, PlayerAvailabilityEntry>,
): Profile {
  const scores: number[] = [];
  const winMargins: number[] = [];
  const form: string[] = [];
  const positionTotals: Record<PositionKey, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (const week of weeks) {
    const target = week.find((matchup) => matchup.roster_id === rosterId);
    if (!target) continue;
    const opponent = week.find((matchup) => matchup.matchup_id === target.matchup_id && matchup.roster_id !== rosterId);
    if (!opponent) continue;
    const points = Number(target.custom_points ?? target.points ?? 0);
    const opponentPoints = Number(opponent.custom_points ?? opponent.points ?? 0);
    if (!Number.isFinite(points) || !Number.isFinite(opponentPoints) || (points === 0 && opponentPoints === 0)) continue;

    scores.push(points);
    if (points > opponentPoints) {
      wins += 1;
      form.push('W');
      winMargins.push(points - opponentPoints);
    } else if (points < opponentPoints) {
      losses += 1;
      form.push('L');
    } else {
      ties += 1;
      form.push('T');
    }

    const weeklyPositions: Record<PositionKey, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const playerPoints = (target.players_points || {}) as Record<string, number>;
    for (const playerId of (target.starters || []) as string[]) {
      if (!playerId || playerId === '0') continue;
      const position = normalizePosition(players[playerId]?.position);
      if (!position) continue;
      weeklyPositions[position] += Number(playerPoints[playerId] ?? 0);
    }
    (Object.keys(weeklyPositions) as PositionKey[]).forEach((position) => positionTotals[position].push(weeklyPositions[position]));
  }

  const avg = average(scores);
  const variance = avg === null || scores.length < 2
    ? null
    : scores.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / scores.length;
  const positionAverages = (Object.keys(positionTotals) as PositionKey[])
    .map((position) => ({ position, ppg: average(positionTotals[position]) ?? 0 }))
    .sort((a, b) => b.ppg - a.ppg);
  const bestPosition = positionAverages[0]?.ppg > 0 ? positionAverages[0] : null;
  const flaggedStarters = starters.filter((playerId) => {
    const entry = availability[playerId];
    if (!entry) return false;
    return entry.tier === 'inactive'
      || entry.weight < 0.9
      || entry.reasons.some((reason) => reason.startsWith('injury-') || reason.startsWith('practice-'));
  }).length;

  return {
    games: scores.length,
    wins,
    losses,
    ties,
    avg,
    last3: average(scores.slice(-3)),
    high: scores.length ? Math.max(...scores) : null,
    low: scores.length ? Math.min(...scores) : null,
    stdDev: variance === null ? null : Math.sqrt(variance),
    avgMarginInWins: average(winMargins),
    recentForm: form.slice(-5).join(' '),
    bestPosition,
    flaggedStarters,
  };
}

function varianceLabel(stdDev: number | null) {
  if (stdDev === null) return 'Not enough data';
  if (stdDev <= 15) return 'Steady scoring profile';
  if (stdDev <= 24) return 'Moderate weekly variance';
  return 'High boom/bust variance';
}

function ProfileCard({ team, profile }: { team: TeamInput; profile: Profile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{team.name}</CardTitle>
      </CardHeader>
      <CardContent>
        {profile.games === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Season tendencies will populate after this team has played a 2026 game.</p>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Current availability</div>
              <div className="mt-1 text-lg font-black">{profile.flaggedStarters}</div>
              <div className="text-xs text-[var(--muted)]">projected starter{profile.flaggedStarters === 1 ? '' : 's'} carrying an injury/practice flag</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Record" value={`${profile.wins}-${profile.losses}${profile.ties ? `-${profile.ties}` : ''}`} />
              <Stat label="PPG" value={profile.avg?.toFixed(1) ?? '—'} />
              <Stat label="Last 3" value={profile.last3?.toFixed(1) ?? '—'} />
              <Stat label="Range" value={profile.high !== null && profile.low !== null ? `${profile.low.toFixed(0)}-${profile.high.toFixed(0)}` : '—'} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Scoring identity</div>
                <div className="mt-1 text-sm font-bold">{varianceLabel(profile.stdDev)}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {profile.bestPosition ? `${profile.bestPosition.position} starters lead the offense at ${profile.bestPosition.ppg.toFixed(1)} points per game.` : 'Position profile still developing.'}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">How they win</div>
                <div className="mt-1 text-sm font-bold">{profile.avgMarginInWins !== null ? `+${profile.avgMarginInWins.toFixed(1)} average margin` : 'No wins yet'}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Recent form: {profile.recentForm || '—'}</div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Availability watch</div>
                  <div className="mt-1 text-sm font-bold">{profile.flaggedStarters} starter{profile.flaggedStarters === 1 ? '' : 's'} need attention</div>
                </div>
                <div className="text-2xl font-black tabular-nums">{profile.flaggedStarters}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-base font-black tabular-nums">{value}</div>
    </div>
  );
}

export default async function OpponentScoutingReport({ leagueId, week, left, right, availability }: Props) {
  const priorWeeks = Array.from({ length: Math.max(0, week - 1) }, (_, index) => index + 1);
  const [players, history] = await Promise.all([
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    Promise.all(priorWeeks.map((priorWeek) => getLeagueMatchups(leagueId, priorWeek).catch(() => [] as SleeperMatchup[]))),
  ]);

  const leftProfile = buildProfile(left.rosterId, history, players, left.starters, availability);
  const rightProfile = buildProfile(right.rosterId, history, players, right.starters, availability);

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-black">Opponent Scouting Report</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">League-specific tendencies from actual East v. West scoring, plus current starter availability.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard team={left} profile={leftProfile} />
        <ProfileCard team={right} profile={rightProfile} />
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">Free live sources: Sleeper league/player/injury data and ESPN depth-chart context through the site&apos;s existing availability model.</div>
    </section>
  );
}
