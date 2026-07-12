'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import {
  BroadcastPanel,
  BroadcastTeamLogo,
  teamAccent,
} from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import { LEAGUE_IDS } from '@/lib/constants/league';
import type { TeamRow } from '@/types/trade-block';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { StandingsTeam } from './PlayoffRacePanel';

const POS_LABELS: Record<string, string> = {
  QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs',
  '1st': '1st-round picks', '2nd': '2nd-round picks', '3rd': '3rd-round picks',
};

const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
type Position = (typeof POSITIONS)[number];

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatCompact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return Math.round(value).toLocaleString();
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const MATCHES_PER_PAGE = 4;
const MAX_ROTATING_MATCHES = 20;
const MATCH_ROTATION_MS = 7000;

type MarketMatch = {
  buyer: string;
  seller: string;
  position: string;
};

type TradeMarketSummaryProps = {
  rows: TeamRow[];
  playerPositions: Record<string, string>;
};

function TradeMarketSummary({ rows, playerPositions }: TradeMarketSummaryProps) {
  const activeBlocks = rows.filter((r) => r.tradeBlock.length > 0);
  const totalPlayers = activeBlocks.reduce(
    (sum, row) => sum + row.tradeBlock.filter((asset) => asset.type === 'player').length,
    0
  );
  const totalPicks = activeBlocks.reduce(
    (sum, row) => sum + row.tradeBlock.filter((asset) => asset.type === 'pick').length,
    0
  );

  const wantedPos: Record<string, number> = {};
  for (const row of activeBlocks) {
    for (const position of row.tradeWants?.positions ?? []) {
      wantedPos[position] = (wantedPos[position] ?? 0) + 1;
    }
  }
  const topWants = Object.entries(wantedPos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const matches = useMemo(() => {
    const matchesByBuyer = new Map<string, MarketMatch[]>();

    for (const buyer of rows) {
      const wants = buyer.tradeWants?.positions ?? [];
      if (wants.length === 0) continue;

      const buyerMatches: MarketMatch[] = [];
      for (const seller of rows) {
        if (seller.team === buyer.team) continue;

        for (const want of wants) {
          const wantLower = want.toLowerCase();
          const isPickWant = wantLower === '1st' || wantLower === '2nd' || wantLower === '3rd';

          if (isPickWant) {
            const wantedRound = parseInt(want[0], 10);
            const hasPick = seller.tradeBlock.some(
              (asset) => asset.type === 'pick' && (asset as { round: number }).round === wantedRound
            );
            const position = `${want}-round pick`;
            if (hasPick && !buyerMatches.some((match) => match.seller === seller.team && match.position === position)) {
              buyerMatches.push({ buyer: buyer.team, seller: seller.team, position });
            }
            continue;
          }

          const wantUpper = want.toUpperCase();
          const hasPlayer = seller.tradeBlock.some((asset) => {
            if (asset.type !== 'player') return false;
            const position = playerPositions[(asset as { playerId: string }).playerId];
            return position?.toUpperCase() === wantUpper;
          });
          if (hasPlayer && !buyerMatches.some((match) => match.seller === seller.team && match.position === wantUpper)) {
            buyerMatches.push({ buyer: buyer.team, seller: seller.team, position: wantUpper });
          }
        }
      }

      if (buyerMatches.length > 0) matchesByBuyer.set(buyer.team, buyerMatches);
    }

    const balancedMatches: MarketMatch[] = [];
    let matchIndex = 0;
    let addedMatch = true;
    while (addedMatch && balancedMatches.length < MAX_ROTATING_MATCHES) {
      addedMatch = false;
      for (const buyer of rows) {
        const match = matchesByBuyer.get(buyer.team)?.[matchIndex];
        if (!match) continue;
        balancedMatches.push(match);
        addedMatch = true;
        if (balancedMatches.length >= MAX_ROTATING_MATCHES) break;
      }
      matchIndex += 1;
    }

    return balancedMatches;
  }, [rows, playerPositions]);

  const matchPages = useMemo(() => {
    const pages: MarketMatch[][] = [];
    for (let index = 0; index < matches.length; index += MATCHES_PER_PAGE) {
      pages.push(matches.slice(index, index + MATCHES_PER_PAGE));
    }
    return pages;
  }, [matches]);

  const [matchPage, setMatchPage] = useState(0);

  useEffect(() => {
    if (matchPages.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const interval = window.setInterval(() => {
      setMatchPage((page) => (page + 1) % matchPages.length);
    }, MATCH_ROTATION_MS);

    return () => window.clearInterval(interval);
  }, [matchPages.length]);

  const activeMatchPage = matchPages.length > 0 ? matchPage % matchPages.length : 0;
  const visibleMatches = matchPages[activeMatchPage] ?? [];

  const recent = [...activeBlocks]
    .filter((row) => row.updatedAt)
    .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())
    .slice(0, 3);

  return (
    <BroadcastPanel accent="#10b981" title="Trade market" meta={`${activeBlocks.length} active blocks`} className="h-full">
      <div className="space-y-4">
        <div className="flex gap-6 text-center">
          <div>
            <div className="text-2xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {activeBlocks.length}
            </div>
            <div className="text-xs uppercase tracking-wide" style={broadcastFaintTextStyle}>Teams listing</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {totalPlayers}
            </div>
            <div className="text-xs uppercase tracking-wide" style={broadcastFaintTextStyle}>Players listed</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {totalPicks}
            </div>
            <div className="text-xs uppercase tracking-wide" style={broadcastFaintTextStyle}>Picks listed</div>
          </div>
        </div>

        {topWants.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={broadcastFaintTextStyle}>
              Most wanted
            </div>
            <div className="flex flex-wrap gap-2">
              {topWants.map(([position, count]) => (
                <span
                  key={position}
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={{ background: PANEL.tintStrong, color: PANEL.text }}
                >
                  {POS_LABELS[position] ?? position} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {visibleMatches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={broadcastFaintTextStyle}>
                Potential matches
              </div>
              {matchPages.length > 1 && (
                <div className="text-[10px] tabular-nums" style={broadcastFaintTextStyle}>
                  {activeMatchPage + 1}/{matchPages.length}
                </div>
              )}
            </div>
            <ul className="space-y-1" aria-live="polite">
              {visibleMatches.map((match) => (
                <li key={`${match.buyer}-${match.seller}-${match.position}`} className="text-xs" style={broadcastMutedTextStyle}>
                  <span className="font-semibold" style={broadcastBodyTextStyle}>{match.buyer}</span>
                  {' '}wants {POS_LABELS[match.position] ?? match.position} ·{' '}
                  <span className="font-semibold" style={broadcastBodyTextStyle}>{match.seller}</span>
                  {' '}has one listed
                </li>
              ))}
            </ul>
            {matchPages.length > 1 && (
              <div className="flex gap-1.5 mt-2" aria-label="Potential match pages">
                {matchPages.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setMatchPage(index)}
                    aria-label={`Show potential matches page ${index + 1}`}
                    aria-current={index === activeMatchPage ? 'page' : undefined}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: index === activeMatchPage ? '1rem' : '0.375rem',
                      background: index === activeMatchPage ? PANEL.text : PANEL.faint,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={broadcastFaintTextStyle}>
              Recently updated
            </div>
            <ul className="space-y-0.5">
              {recent.map((row) => (
                <li key={row.team} className="text-xs" style={broadcastMutedTextStyle}>
                  <Link
                    href={`/trade-block?team=${encodeURIComponent(row.team)}`}
                    className="underline hover:text-[var(--panel-text)]"
                  >
                    {row.team}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-1">
          <Link
            href="/trade-block"
            className="text-xs underline hover:text-[var(--panel-text)]"
            style={broadcastFaintTextStyle}
          >
            View all trade blocks →
          </Link>
        </div>
      </div>
    </BroadcastPanel>
  );
}

const SNAPSHOT_ROTATION_MS = 8000;

type TradeValueRecord = {
  name?: string;
  sleeperId?: string;
  position?: string;
  age?: number | null;
  value?: number;
  trend?: number;
  isPick?: boolean;
};

type SleeperRoster = {
  roster_id: number;
  players?: string[];
  taxi?: string[];
  reserve?: string[];
  settings?: Record<string, unknown>;
};

type SleeperLeague = {
  season?: string;
};

type SleeperTradedPick = {
  season?: string;
  round?: number;
  roster_id?: number;
  owner_id?: number;
};

type SleeperMatchup = {
  roster_id: number;
  matchup_id: number;
  points?: number;
  custom_points?: number;
};

type SnapshotSource = {
  values: Record<string, TradeValueRecord>;
  rosters: SleeperRoster[];
  leagueSeason: number;
  tradedPicks: SleeperTradedPick[];
  week: number | null;
  matchups: SleeperMatchup[];
};

type DraftCapitalRow = {
  team: string;
  value: number;
  count: number;
  firsts: number;
};

type TeamSnapshot = {
  team: string;
  rosterId: number;
  totalValue: number;
  rosterRank: number;
  pointsRank: number;
  youthRank: number | null;
  draftRank: number;
  averageAge: number | null;
  strongestPosition: Position | null;
  weakestPosition: Position | null;
  topPlayer: { name: string; value: number } | null;
  listedAssets: number;
  draftValue: number;
  draftPicks: number;
  firsts: number;
  wins: number;
  losses: number;
  pointsFor: number;
  topThreeShare: number | null;
};

type PlayerMover = {
  id: string;
  name: string;
  team: string;
  position: string;
  value: number;
  trend: number;
  listed: boolean;
};

type MatchupSpotlight = {
  week: number;
  first: StandingsTeam;
  second: StandingsTeam;
  firstScore: number | null;
  secondScore: number | null;
};

type SnapshotData = {
  teams: TeamSnapshot[];
  risers: PlayerMover[];
  fallers: PlayerMover[];
  draftLeaders: DraftCapitalRow[];
  draftYears: number[];
  youngest: TeamSnapshot | null;
  oldest: TeamSnapshot | null;
  richest: TeamSnapshot | null;
  balanced: TeamSnapshot | null;
  topHeavy: TeamSnapshot | null;
  matchup: MatchupSpotlight | null;
};

function pointsFromRosterSettings(settings?: Record<string, unknown>): number {
  if (!settings) return 0;
  return numeric(settings.ppts) + numeric(settings.ppts_decimal) / 100;
}

function LeagueSnapshotFallback({
  standings,
  positionCounts,
}: {
  standings: StandingsTeam[];
  positionCounts: Record<string, Record<string, number>>;
}) {
  const leaders = [...standings].sort((a, b) => a.seed - b.seed).slice(0, 5);
  const countTeams = Object.keys(positionCounts);

  return (
    <div className="space-y-4">
      <div className="text-xs" style={broadcastMutedTextStyle}>
        Live roster analytics are temporarily unavailable. Basic league data is shown instead.
      </div>
      {leaders.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={broadcastFaintTextStyle}>
            Current leaders
          </div>
          <ul className="space-y-2">
            {leaders.map((team) => (
              <li key={team.rosterId} className="flex items-center justify-between text-xs">
                <span className="font-semibold" style={broadcastBodyTextStyle}>#{team.seed} {team.teamName}</span>
                <span className="tabular-nums" style={broadcastMutedTextStyle}>{team.wins}–{team.losses}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {countTeams.length > 0 && (
        <div className="text-xs" style={broadcastFaintTextStyle}>
          Position-count data is available for {countTeams.length} teams.
        </div>
      )}
    </div>
  );
}

function LeagueSnapshot({
  rows,
  standings,
  positionCounts,
  phase,
}: {
  rows: TeamRow[];
  standings: StandingsTeam[];
  positionCounts: Record<string, Record<string, number>>;
  phase?: HomepagePhase;
}) {
  const [source, setSource] = useState<SnapshotSource | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const previousPage = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSnapshot() {
      try {
        setError(false);
        const leagueId = LEAGUE_IDS.CURRENT;
        const [valuesResponse, rostersResponse, leagueResponse, tradedPicksResponse] = await Promise.all([
          fetch('/api/trade-analyzer/values', { signal: controller.signal, cache: 'no-store' }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { signal: controller.signal }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { signal: controller.signal }),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, { signal: controller.signal }),
        ]);

        if (!valuesResponse.ok || !rostersResponse.ok || !leagueResponse.ok || !tradedPicksResponse.ok) {
          throw new Error('Snapshot source unavailable');
        }

        const valuesPayload = await valuesResponse.json() as { values?: Record<string, TradeValueRecord> };
        const rosters = await rostersResponse.json() as SleeperRoster[];
        const league = await leagueResponse.json() as SleeperLeague;
        const tradedPicks = await tradedPicksResponse.json() as SleeperTradedPick[];

        let week: number | null = null;
        let matchups: SleeperMatchup[] = [];
        if (phase === 'regular_season' || phase === 'post_deadline_pre_postseason') {
          const stateResponse = await fetch('https://api.sleeper.app/v1/state/nfl', { signal: controller.signal });
          if (stateResponse.ok) {
            const state = await stateResponse.json() as { week?: number; display_week?: number };
            week = Math.max(1, numeric(state.week ?? state.display_week ?? 1));
            const matchupResponse = await fetch(
              `https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`,
              { signal: controller.signal }
            );
            if (matchupResponse.ok) matchups = await matchupResponse.json() as SleeperMatchup[];
          }
        }

        if (!controller.signal.aborted) {
          setSource({
            values: valuesPayload.values ?? {},
            rosters: Array.isArray(rosters) ? rosters : [],
            leagueSeason: numeric(league.season) || new Date().getFullYear(),
            tradedPicks: Array.isArray(tradedPicks) ? tradedPicks : [],
            week,
            matchups,
          });
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          console.error('[league-snapshot] failed to load', loadError);
          setError(true);
        }
      }
    }

    void loadSnapshot();
    return () => controller.abort();
  }, [phase]);

  const data = useMemo<SnapshotData | null>(() => {
    if (!source || standings.length === 0) return null;

    const standingsByRoster = new Map(standings.map((team) => [team.rosterId, team]));
    const teamByRoster = new Map(standings.map((team) => [team.rosterId, team.teamName]));
    const valueByPlayer = new Map<string, TradeValueRecord & { name: string; position: string; value: number }>();

    for (const [key, raw] of Object.entries(source.values)) {
      if (raw.isPick) continue;
      const id = String(raw.sleeperId ?? key);
      const position = String(raw.position ?? '').toUpperCase();
      if (!POSITIONS.includes(position as Position)) continue;
      const value = numeric(raw.value);
      if (!id || !raw.name || value <= 0) continue;
      valueByPlayer.set(id, {
        ...raw,
        name: raw.name,
        position,
        value,
      });
    }

    const listedPlayerIds = new Set<string>();
    const listedCountByTeam = new Map<string, number>();
    for (const row of rows) {
      listedCountByTeam.set(row.team, row.tradeBlock.length);
      for (const asset of row.tradeBlock) {
        if (asset.type === 'player') listedPlayerIds.add((asset as { playerId: string }).playerId);
      }
    }

    const startYear = phase === 'post_championship_pre_draft'
      ? source.leagueSeason
      : source.leagueSeason + 1;
    const draftYears = [startYear, startYear + 1];
    const ownership = new Map<string, number>();

    for (const roster of source.rosters) {
      for (const year of draftYears) {
        for (let round = 1; round <= 4; round += 1) {
          ownership.set(`${year}-${roster.roster_id}-${round}`, roster.roster_id);
        }
      }
    }

    for (const pick of source.tradedPicks) {
      const year = numeric(pick.season);
      const round = numeric(pick.round);
      const originalRoster = numeric(pick.roster_id);
      const owner = numeric(pick.owner_id);
      if (!draftYears.includes(year) || round < 1 || round > 4 || !originalRoster || !owner) continue;
      ownership.set(`${year}-${originalRoster}-${round}`, owner);
    }

    const draftByTeam = new Map<string, DraftCapitalRow>();
    for (const standing of standings) {
      draftByTeam.set(standing.teamName, { team: standing.teamName, value: 0, count: 0, firsts: 0 });
    }

    for (const [pickKey, ownerRosterId] of ownership.entries()) {
      const [yearString, , roundString] = pickKey.split('-');
      const year = numeric(yearString);
      const round = numeric(roundString);
      const ownerTeam = teamByRoster.get(ownerRosterId);
      if (!ownerTeam) continue;
      const row = draftByTeam.get(ownerTeam);
      if (!row) continue;
      const standardKey = `PICK_${year}_${round}_MID`;
      const sourcedValue = numeric(source.values[standardKey]?.value);
      const fallback = ({ 1: 4500, 2: 2500, 3: 1400, 4: 800 } as Record<number, number>)[round] ?? 500;
      row.value += sourcedValue || Math.round(fallback * Math.pow(0.85, year - startYear));
      row.count += 1;
      if (round === 1) row.firsts += 1;
    }

    const draftLeaders = [...draftByTeam.values()].sort(
      (a, b) => b.value - a.value || b.firsts - a.firsts || a.team.localeCompare(b.team)
    );
    const draftRank = new Map(draftLeaders.map((row, index) => [row.team, index + 1]));

    type RawTeam = Omit<TeamSnapshot, 'rosterRank' | 'pointsRank' | 'youthRank' | 'strongestPosition' | 'weakestPosition'> & {
      positionValues: Record<Position, number>;
      pointsMetric: number;
    };

    const playerOwners = new Map<string, string>();
    const rawTeams: RawTeam[] = [];

    for (const roster of source.rosters) {
      const standing = standingsByRoster.get(roster.roster_id);
      if (!standing) continue;
      const playerIds = new Set<string>([
        ...(roster.players ?? []),
        ...(roster.taxi ?? []),
        ...(roster.reserve ?? []),
      ]);
      const positionValues: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
      const ageValues: number[] = [];
      const valuedPlayers: Array<{ id: string; name: string; value: number; position: string; age: number | null }> = [];

      for (const id of playerIds) {
        playerOwners.set(id, standing.teamName);
        const player = valueByPlayer.get(id);
        if (!player) continue;
        const position = player.position as Position;
        positionValues[position] += player.value;
        const age = numeric(player.age);
        if (age > 0) ageValues.push(age);
        valuedPlayers.push({
          id,
          name: player.name,
          value: player.value,
          position,
          age: age > 0 ? age : null,
        });
      }

      valuedPlayers.sort((a, b) => b.value - a.value);
      const totalValue = valuedPlayers.reduce((sum, player) => sum + player.value, 0);
      const topThreeValue = valuedPlayers.slice(0, 3).reduce((sum, player) => sum + player.value, 0);
      const draft = draftByTeam.get(standing.teamName) ?? {
        team: standing.teamName,
        value: 0,
        count: 0,
        firsts: 0,
      };
      const maxPoints = pointsFromRosterSettings(roster.settings);

      rawTeams.push({
        team: standing.teamName,
        rosterId: roster.roster_id,
        totalValue,
        averageAge: ageValues.length > 0
          ? ageValues.reduce((sum, age) => sum + age, 0) / ageValues.length
          : null,
        topPlayer: valuedPlayers[0] ? { name: valuedPlayers[0].name, value: valuedPlayers[0].value } : null,
        listedAssets: listedCountByTeam.get(standing.teamName) ?? 0,
        draftValue: draft.value,
        draftPicks: draft.count,
        firsts: draft.firsts,
        draftRank: draftRank.get(standing.teamName) ?? standings.length,
        wins: standing.wins,
        losses: standing.losses,
        pointsFor: standing.fpts,
        topThreeShare: totalValue > 0 ? topThreeValue / totalValue : null,
        positionValues,
        pointsMetric: maxPoints > 0 ? maxPoints : standing.fpts,
      });
    }

    const rosterOrder = [...rawTeams].sort((a, b) => b.totalValue - a.totalValue || a.team.localeCompare(b.team));
    const pointsOrder = [...rawTeams].sort((a, b) => b.pointsMetric - a.pointsMetric || a.team.localeCompare(b.team));
    const youthOrder = rawTeams
      .filter((team) => team.averageAge !== null)
      .sort((a, b) => (a.averageAge ?? 99) - (b.averageAge ?? 99) || a.team.localeCompare(b.team));
    const rosterRanks = new Map(rosterOrder.map((team, index) => [team.team, index + 1]));
    const pointsRanks = new Map(pointsOrder.map((team, index) => [team.team, index + 1]));
    const youthRanks = new Map(youthOrder.map((team, index) => [team.team, index + 1]));

    const positionAverages: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const position of POSITIONS) {
      positionAverages[position] = rawTeams.length > 0
        ? rawTeams.reduce((sum, team) => sum + team.positionValues[position], 0) / rawTeams.length
        : 0;
    }

    const teams: TeamSnapshot[] = rawTeams
      .map((team) => {
        const ratios = POSITIONS.map((position) => ({
          position,
          ratio: positionAverages[position] > 0
            ? team.positionValues[position] / positionAverages[position]
            : 0,
        }));
        const strongest = [...ratios].sort((a, b) => b.ratio - a.ratio)[0]?.position ?? null;
        const weakest = [...ratios].sort((a, b) => a.ratio - b.ratio)[0]?.position ?? null;
        return {
          team: team.team,
          rosterId: team.rosterId,
          totalValue: team.totalValue,
          rosterRank: rosterRanks.get(team.team) ?? rawTeams.length,
          pointsRank: pointsRanks.get(team.team) ?? rawTeams.length,
          youthRank: youthRanks.get(team.team) ?? null,
          draftRank: team.draftRank,
          averageAge: team.averageAge,
          strongestPosition: strongest,
          weakestPosition: weakest,
          topPlayer: team.topPlayer,
          listedAssets: team.listedAssets,
          draftValue: team.draftValue,
          draftPicks: team.draftPicks,
          firsts: team.firsts,
          wins: team.wins,
          losses: team.losses,
          pointsFor: team.pointsFor,
          topThreeShare: team.topThreeShare,
        };
      })
      .sort((a, b) => a.team.localeCompare(b.team));

    const movers: PlayerMover[] = [];
    for (const [id, player] of valueByPlayer.entries()) {
      const team = playerOwners.get(id);
      const trend = numeric(player.trend);
      if (!team || trend === 0) continue;
      movers.push({
        id,
        name: player.name,
        team,
        position: player.position,
        value: player.value,
        trend,
        listed: listedPlayerIds.has(id),
      });
    }
    const risers = [...movers].sort((a, b) => b.trend - a.trend).slice(0, 3);
    const fallers = [...movers].sort((a, b) => a.trend - b.trend).slice(0, 3);

    const ageEligible = teams.filter((team) => team.averageAge !== null);
    const shareEligible = teams.filter((team) => team.topThreeShare !== null);
    const youngest = [...ageEligible].sort((a, b) => (a.averageAge ?? 99) - (b.averageAge ?? 99))[0] ?? null;
    const oldest = [...ageEligible].sort((a, b) => (b.averageAge ?? 0) - (a.averageAge ?? 0))[0] ?? null;
    const richest = [...teams].sort((a, b) => b.totalValue - a.totalValue)[0] ?? null;
    const balanced = [...shareEligible].sort((a, b) => (a.topThreeShare ?? 1) - (b.topThreeShare ?? 1))[0] ?? null;
    const topHeavy = [...shareEligible].sort((a, b) => (b.topThreeShare ?? 0) - (a.topThreeShare ?? 0))[0] ?? null;

    const matchupGroups = new Map<number, SleeperMatchup[]>();
    for (const matchup of source.matchups) {
      const group = matchupGroups.get(matchup.matchup_id) ?? [];
      group.push(matchup);
      matchupGroups.set(matchup.matchup_id, group);
    }
    const matchupCandidates: MatchupSpotlight[] = [];
    for (const group of matchupGroups.values()) {
      if (group.length < 2 || source.week === null) continue;
      const firstStanding = standingsByRoster.get(group[0].roster_id);
      const secondStanding = standingsByRoster.get(group[1].roster_id);
      if (!firstStanding || !secondStanding) continue;
      const scoreFor = (entry: SleeperMatchup) => {
        const score = numeric(entry.custom_points ?? entry.points);
        return score > 0 ? score : null;
      };
      matchupCandidates.push({
        week: source.week,
        first: firstStanding,
        second: secondStanding,
        firstScore: scoreFor(group[0]),
        secondScore: scoreFor(group[1]),
      });
    }
    matchupCandidates.sort((a, b) => {
      const combinedWinsA = a.first.wins + a.second.wins;
      const combinedWinsB = b.first.wins + b.second.wins;
      if (combinedWinsA !== combinedWinsB) return combinedWinsB - combinedWinsA;
      return (a.first.seed + a.second.seed) - (b.first.seed + b.second.seed);
    });

    return {
      teams,
      risers,
      fallers,
      draftLeaders,
      draftYears,
      youngest,
      oldest,
      richest,
      balanced,
      topHeavy,
      matchup: matchupCandidates[0] ?? null,
    };
  }, [source, standings, rows, phase]);

  const fourthPage = phase === 'regular_season'
    ? 'matchup'
    : phase === 'post_deadline_pre_postseason'
      ? 'bubble'
      : phase === 'postseason'
        ? 'playoffs'
        : 'extremes';
  const pageKeys = ['team', 'movers', 'draft', fourthPage] as const;
  const activePage = pageKeys[page % pageKeys.length];

  useEffect(() => {
    if (paused || pageKeys.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => {
      setPage((current) => (current + 1) % pageKeys.length);
    }, SNAPSHOT_ROTATION_MS);
    return () => window.clearInterval(interval);
  }, [paused, pageKeys.length]);

  useEffect(() => {
    if (previousPage.current !== 0 && page === 0 && (data?.teams.length ?? 0) > 1) {
      setSpotlightIndex((current) => (current + 1) % (data?.teams.length ?? 1));
    }
    previousPage.current = page;
  }, [page, data?.teams.length]);

  useEffect(() => {
    if (data && spotlightIndex >= data.teams.length) setSpotlightIndex(0);
  }, [data, spotlightIndex]);

  const pageLabel = activePage === 'team'
    ? 'Team spotlight'
    : activePage === 'movers'
      ? 'Value movers'
      : activePage === 'draft'
        ? 'Draft capital'
        : activePage === 'matchup'
          ? 'Matchup spotlight'
          : activePage === 'bubble'
            ? 'Playoff bubble'
            : activePage === 'playoffs'
              ? 'Playoff field'
              : 'Roster extremes';

  const spotlight = data?.teams[spotlightIndex] ?? null;
  const accent = spotlight && activePage === 'team' ? teamAccent(spotlight.team) : '#6366f1';

  const renderTeamSpotlight = () => {
    if (!data || !spotlight) return null;
    const teamAccentColor = teamAccent(spotlight.team);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BroadcastTeamLogo team={spotlight.team} accent={teamAccentColor} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-extrabold" style={broadcastBodyTextStyle}>{spotlight.team}</div>
            <div className="text-xs" style={broadcastMutedTextStyle}>
              {spotlight.wins}–{spotlight.losses} · {formatNumber(spotlight.pointsFor)} points
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold tabular-nums" style={{ color: teamAccentColor }}>
              #{spotlight.rosterRank}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={broadcastFaintTextStyle}>Roster value</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            ['Roster value', formatCompact(spotlight.totalValue), `#${spotlight.rosterRank} of ${data.teams.length}`],
            ['Points rank', `#${spotlight.pointsRank}`, `${formatNumber(spotlight.pointsFor)} PF`],
            ['Average age', spotlight.averageAge?.toFixed(1) ?? 'N/A', spotlight.youthRank ? `#${spotlight.youthRank} youngest` : 'Age data limited'],
            ['Draft capital', `#${spotlight.draftRank}`, `${spotlight.draftPicks} picks · ${spotlight.firsts} firsts`],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg p-3" style={{ background: PANEL.tintSoft }}>
              <div className="text-[10px] uppercase tracking-wider" style={broadcastFaintTextStyle}>{label}</div>
              <div className="mt-0.5 text-lg font-extrabold tabular-nums" style={broadcastBodyTextStyle}>{value}</div>
              <div className="text-[10px]" style={broadcastMutedTextStyle}>{detail}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span style={broadcastFaintTextStyle}>Strongest position</span>
            <span className="font-semibold" style={broadcastBodyTextStyle}>{spotlight.strongestPosition ?? 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span style={broadcastFaintTextStyle}>Biggest need</span>
            <span className="font-semibold" style={broadcastBodyTextStyle}>{spotlight.weakestPosition ?? 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span style={broadcastFaintTextStyle}>Top asset</span>
            <span className="truncate font-semibold" style={broadcastBodyTextStyle}>
              {spotlight.topPlayer ? `${spotlight.topPlayer.name} (${formatCompact(spotlight.topPlayer.value)})` : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span style={broadcastFaintTextStyle}>Trade block</span>
            <span className="font-semibold" style={broadcastBodyTextStyle}>{spotlight.listedAssets} assets listed</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setSpotlightIndex((current) => (current - 1 + data.teams.length) % data.teams.length)}
            className="rounded px-2 py-1 text-xs"
            style={{ background: PANEL.tintStrong, color: PANEL.text }}
            aria-label="Previous team spotlight"
          >
            Previous
          </button>
          <span className="text-[10px] tabular-nums" style={broadcastFaintTextStyle}>
            {spotlightIndex + 1}/{data.teams.length}
          </span>
          <button
            type="button"
            onClick={() => setSpotlightIndex((current) => (current + 1) % data.teams.length)}
            className="rounded px-2 py-1 text-xs"
            style={{ background: PANEL.tintStrong, color: PANEL.text }}
            aria-label="Next team spotlight"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const renderMoverList = (title: string, movers: PlayerMover[], positive: boolean) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={broadcastFaintTextStyle}>{title}</div>
      <ul className="space-y-2">
        {movers.length > 0 ? movers.map((mover) => (
          <li key={mover.id} className="flex items-center gap-2 rounded-lg p-2.5" style={{ background: PANEL.tintSoft }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold" style={broadcastBodyTextStyle}>{mover.name}</span>
                <span className="text-[9px] font-bold" style={broadcastFaintTextStyle}>{mover.position}</span>
                {mover.listed && (
                  <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase" style={{ background: PANEL.tintStrong, color: PANEL.text }}>
                    Listed
                  </span>
                )}
              </div>
              <div className="truncate text-[10px]" style={broadcastMutedTextStyle}>{mover.team} · {formatCompact(mover.value)}</div>
            </div>
            <div className="text-sm font-extrabold tabular-nums" style={{ color: positive ? '#10b981' : '#f87171' }}>
              {mover.trend > 0 ? '+' : ''}{formatNumber(mover.trend)}
            </div>
          </li>
        )) : (
          <li className="text-xs" style={broadcastMutedTextStyle}>No movement data available.</li>
        )}
      </ul>
    </div>
  );

  const renderValueMovers = () => data ? (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {renderMoverList('Biggest risers', data.risers, true)}
      {renderMoverList('Biggest fallers', data.fallers, false)}
    </div>
  ) : null;

  const renderDraftCapital = () => data ? (
    <div className="space-y-4">
      <div className="text-xs" style={broadcastMutedTextStyle}>
        Future-pick value for {data.draftYears.join(' and ')} using the trade analyzer’s current mid-pick values.
      </div>
      <ol className="space-y-2">
        {data.draftLeaders.slice(0, 5).map((row, index) => (
          <li key={row.team} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-lg p-2.5" style={{ background: PANEL.tintSoft }}>
            <span className="text-lg font-extrabold tabular-nums" style={broadcastFaintTextStyle}>#{index + 1}</span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold" style={broadcastBodyTextStyle}>{row.team}</div>
              <div className="text-[10px]" style={broadcastMutedTextStyle}>{row.count} picks · {row.firsts} first-rounders</div>
            </div>
            <span className="text-sm font-extrabold tabular-nums" style={broadcastBodyTextStyle}>{formatCompact(row.value)}</span>
          </li>
        ))}
      </ol>
      {data.draftLeaders.length > 0 && (
        <div className="rounded-lg p-3 text-xs" style={{ background: PANEL.tintStrong, color: PANEL.text }}>
          <span style={broadcastFaintTextStyle}>Most first-rounders: </span>
          <span className="font-semibold">
            {[...data.draftLeaders].sort((a, b) => b.firsts - a.firsts || b.value - a.value)[0].team}
            {' '}({Math.max(...data.draftLeaders.map((row) => row.firsts))})
          </span>
        </div>
      )}
    </div>
  ) : null;

  const renderExtremes = () => {
    if (!data) return null;
    const rowsToShow = [
      ['Youngest roster', data.youngest?.team, data.youngest?.averageAge ? `${data.youngest.averageAge.toFixed(1)} avg.` : 'N/A'],
      ['Oldest roster', data.oldest?.team, data.oldest?.averageAge ? `${data.oldest.averageAge.toFixed(1)} avg.` : 'N/A'],
      ['Highest roster value', data.richest?.team, data.richest ? formatCompact(data.richest.totalValue) : 'N/A'],
      ['Most balanced', data.balanced?.team, data.balanced?.topThreeShare ? `Top 3 = ${Math.round(data.balanced.topThreeShare * 100)}%` : 'N/A'],
      ['Most top-heavy', data.topHeavy?.team, data.topHeavy?.topThreeShare ? `Top 3 = ${Math.round(data.topHeavy.topThreeShare * 100)}%` : 'N/A'],
    ];
    return (
      <div className="space-y-2.5">
        {rowsToShow.map(([label, team, detail]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: PANEL.tintSoft }}>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider" style={broadcastFaintTextStyle}>{label}</div>
              <div className="truncate text-sm font-semibold" style={broadcastBodyTextStyle}>{team ?? 'N/A'}</div>
            </div>
            <div className="shrink-0 text-xs font-semibold tabular-nums" style={broadcastMutedTextStyle}>{detail}</div>
          </div>
        ))}
        <div className="text-[10px] leading-relaxed" style={broadcastFaintTextStyle}>
          Balance is measured by the percentage of total roster value held by a team’s three most valuable players.
        </div>
      </div>
    );
  };

  const renderMatchup = () => {
    if (!data?.matchup) {
      return <div className="text-xs" style={broadcastMutedTextStyle}>This week’s matchups are not available yet.</div>;
    }
    const matchup = data.matchup;
    const teams = [matchup.first, matchup.second];
    const scores = [matchup.firstScore, matchup.secondScore];
    return (
      <div className="space-y-4">
        <div className="text-xs" style={broadcastMutedTextStyle}>
          Week {matchup.week} matchup featuring the highest combined win total.
        </div>
        <div className="space-y-3">
          {teams.map((team, index) => {
            const color = teamAccent(team.teamName);
            return (
              <div key={team.rosterId} className="flex items-center gap-3 rounded-lg p-3" style={{ background: PANEL.tintSoft }}>
                <BroadcastTeamLogo team={team.teamName} accent={color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={broadcastBodyTextStyle}>{team.teamName}</div>
                  <div className="text-[10px]" style={broadcastMutedTextStyle}>#{team.seed} seed · {team.wins}–{team.losses}</div>
                </div>
                <div className="text-xl font-extrabold tabular-nums" style={{ color }}>
                  {scores[index] === null ? '–' : scores[index]?.toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg p-3" style={{ background: PANEL.tintStrong }}>
            <div className="text-xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {matchup.first.wins + matchup.second.wins}
            </div>
            <div className="text-[10px] uppercase" style={broadcastFaintTextStyle}>Combined wins</div>
          </div>
          <div className="rounded-lg p-3" style={{ background: PANEL.tintStrong }}>
            <div className="text-xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {formatNumber(matchup.first.fpts + matchup.second.fpts)}
            </div>
            <div className="text-[10px] uppercase" style={broadcastFaintTextStyle}>Combined PF</div>
          </div>
        </div>
      </div>
    );
  };

  const renderBubble = () => {
    const ordered = [...standings].sort((a, b) => a.seed - b.seed);
    const bubble = ordered.filter((team) => team.seed >= 5 && team.seed <= 8);
    const lastIn = ordered.find((team) => team.seed === 6);
    const firstOut = ordered.find((team) => team.seed === 7);
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {bubble.map((team) => (
            <div key={team.rosterId} className="flex items-center justify-between rounded-lg p-3" style={{ background: PANEL.tintSoft }}>
              <div>
                <div className="text-xs font-semibold" style={broadcastBodyTextStyle}>#{team.seed} {team.teamName}</div>
                <div className="text-[10px]" style={broadcastMutedTextStyle}>{formatNumber(team.fpts)} points for</div>
              </div>
              <div className="text-sm font-extrabold tabular-nums" style={broadcastBodyTextStyle}>{team.wins}–{team.losses}</div>
            </div>
          ))}
        </div>
        {lastIn && firstOut && (
          <div className="rounded-lg p-3 text-xs" style={{ background: PANEL.tintStrong }}>
            <span style={broadcastFaintTextStyle}>Cutline: </span>
            <span className="font-semibold" style={broadcastBodyTextStyle}>{lastIn.teamName}</span>
            <span style={broadcastMutedTextStyle}> leads {firstOut.teamName} by </span>
            <span className="font-semibold" style={broadcastBodyTextStyle}>
              {lastIn.wins !== firstOut.wins
                ? `${lastIn.wins - firstOut.wins} win${Math.abs(lastIn.wins - firstOut.wins) === 1 ? '' : 's'}`
                : `${formatNumber(lastIn.fpts - firstOut.fpts)} PF`}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderPlayoffField = () => {
    const field = [...standings].filter((team) => team.seed <= 6).sort((a, b) => a.seed - b.seed);
    return (
      <div className="space-y-2">
        {field.map((team) => (
          <div key={team.rosterId} className="flex items-center justify-between rounded-lg p-2.5" style={{ background: PANEL.tintSoft }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 text-sm font-extrabold tabular-nums" style={broadcastFaintTextStyle}>#{team.seed}</span>
              <span className="truncate text-xs font-semibold" style={broadcastBodyTextStyle}>{team.teamName}</span>
            </div>
            <span className="text-xs font-semibold tabular-nums" style={broadcastMutedTextStyle}>{team.wins}–{team.losses}</span>
          </div>
        ))}
        <Link href="/brackets" className="block pt-2 text-xs underline" style={broadcastFaintTextStyle}>View playoff brackets →</Link>
      </div>
    );
  };

  let content: ReactNode;
  if (error) {
    content = <LeagueSnapshotFallback standings={standings} positionCounts={positionCounts} />;
  } else if (!data) {
    content = (
      <div className="space-y-3" aria-label="Loading league snapshot">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg" style={{ background: PANEL.tintSoft }} />
        ))}
      </div>
    );
  } else if (activePage === 'team') {
    content = renderTeamSpotlight();
  } else if (activePage === 'movers') {
    content = renderValueMovers();
  } else if (activePage === 'draft') {
    content = renderDraftCapital();
  } else if (activePage === 'matchup') {
    content = renderMatchup();
  } else if (activePage === 'bubble') {
    content = renderBubble();
  } else if (activePage === 'playoffs') {
    content = renderPlayoffField();
  } else {
    content = renderExtremes();
  }

  return (
    <div
      className="h-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <BroadcastPanel accent={accent} title="League snapshot" meta={pageLabel} className="h-full">
        <div className="flex min-h-[420px] flex-col">
          <div className="flex-1" aria-live="polite">{content}</div>
          <div className="mt-5 flex items-center justify-between border-t pt-3" style={{ borderColor: PANEL.hairline }}>
            <div className="flex gap-1.5" aria-label="League snapshot pages">
              {pageKeys.map((key, index) => (
                <button
                  key={`${key}-${index}`}
                  type="button"
                  onClick={() => setPage(index)}
                  aria-label={`Show ${key} snapshot`}
                  aria-current={index === page ? 'page' : undefined}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: index === page ? '1rem' : '0.375rem',
                    background: index === page ? PANEL.text : PANEL.faint,
                  }}
                />
              ))}
            </div>
            <div className="text-[10px] tabular-nums" style={broadcastFaintTextStyle}>
              {page + 1}/{pageKeys.length}{paused ? ' · paused' : ''}
            </div>
          </div>
        </div>
      </BroadcastPanel>
    </div>
  );
}

function PlayoffRaceSummary({ standings }: { standings: StandingsTeam[] }) {
  const cutline = 6;
  const inField = standings.filter((team) => team.seed <= cutline);
  const firstOut = standings.find((team) => team.seed === cutline + 1);
  const lastIn = standings.find((team) => team.seed === cutline);

  return (
    <BroadcastPanel accent="#10b981" title="Playoff race" meta={`Top ${cutline} seeds advance`} className="h-full">
      <div className="space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={broadcastFaintTextStyle}>
            In the field ({inField.length}/{cutline})
          </div>
          <ul className="space-y-1">
            {inField.map((team) => (
              <li key={team.rosterId} className="flex items-center justify-between text-xs">
                <span style={broadcastBodyTextStyle}>{team.teamName}</span>
                <span className="tabular-nums" style={broadcastMutedTextStyle}>{team.wins}–{team.losses}</span>
              </li>
            ))}
          </ul>
        </div>
        {firstOut && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={broadcastFaintTextStyle}>
              First out
            </div>
            <div className="text-xs" style={broadcastMutedTextStyle}>
              <span className="font-semibold" style={broadcastBodyTextStyle}>{firstOut.teamName}</span>
              {' '}{firstOut.wins}–{firstOut.losses}
              {lastIn && lastIn.wins !== firstOut.wins && (
                <span className="ml-1">({lastIn.wins - firstOut.wins}W back)</span>
              )}
            </div>
          </div>
        )}
        <Link href="/standings" className="block text-xs underline hover:text-[var(--panel-text)]" style={broadcastFaintTextStyle}>
          Full standings →
        </Link>
      </div>
    </BroadcastPanel>
  );
}

function PostseasonSummary({ standings }: { standings: StandingsTeam[] }) {
  const cutline = 6;
  const playoff = standings.filter((team) => team.seed <= cutline);
  const consolation = standings.filter((team) => team.seed > cutline);
  return (
    <BroadcastPanel accent="#f59e0b" title="Playoff field" meta="Active playoff teams" className="h-full">
      <div className="space-y-2">
        <ul className="space-y-1">
          {playoff.map((team) => (
            <li key={team.rosterId} className="flex items-center justify-between text-xs">
              <span style={broadcastBodyTextStyle}>{team.teamName}</span>
              <span className="tabular-nums" style={broadcastMutedTextStyle}>{team.wins}–{team.losses}</span>
            </li>
          ))}
        </ul>
        {consolation.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-widest font-bold mt-2" style={broadcastFaintTextStyle}>
              Consolation bracket
            </div>
            <ul className="space-y-1">
              {consolation.slice(0, 3).map((team) => (
                <li key={team.rosterId} className="flex items-center justify-between text-xs" style={broadcastMutedTextStyle}>
                  <span>{team.teamName}</span>
                  <span className="tabular-nums">{team.wins}–{team.losses}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href="/brackets" className="block text-xs underline hover:text-[var(--panel-text)] mt-2" style={broadcastFaintTextStyle}>
          Playoff brackets →
        </Link>
      </div>
    </BroadcastPanel>
  );
}

export type LeaguePulseProps = {
  tradeRows: TeamRow[];
  positionCounts: Record<string, Record<string, number>>;
  playerPositions?: Record<string, string>;
  phase?: HomepagePhase;
  standings?: StandingsTeam[];
  h2hSpotlight?: ReactNode;
};

export default function LeaguePulse({
  tradeRows,
  positionCounts,
  playerPositions = {},
  phase,
  standings = [],
  h2hSpotlight,
}: LeaguePulseProps) {
  const isPostDeadline = phase === 'post_deadline_pre_postseason';
  const isPostseason = phase === 'postseason';
  const showTradeMarket = !isPostDeadline && !isPostseason;

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader title="League pulse" />
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {showTradeMarket ? (
          <TradeMarketSummary rows={tradeRows} playerPositions={playerPositions} />
        ) : isPostDeadline && standings.length > 0 ? (
          <PlayoffRaceSummary standings={standings} />
        ) : isPostseason && standings.length > 0 ? (
          <PostseasonSummary standings={standings} />
        ) : (
          <TradeMarketSummary rows={tradeRows} playerPositions={playerPositions} />
        )}
        <LeagueSnapshot
          rows={tradeRows}
          standings={standings}
          positionCounts={positionCounts}
          phase={phase}
        />
        {h2hSpotlight && (
          <div className="lg:col-span-2">
            {h2hSpotlight}
          </div>
        )}
      </div>
    </section>
  );
}
