'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import CountdownTimer from '@/components/ui/countdown-timer';
import { IMPORTANT_DATES, LEAGUE_IDS } from '@/lib/constants/league';
import EmptyState from '@/components/ui/empty-state';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayers, SleeperPlayer } from '@/lib/utils/sleeper-api';
import SectionHeader from '@/components/ui/SectionHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { getTeamColors, getTeamColorStyle, getTeamLogoPath } from '@/lib/utils/team-utils';
import { HomeIcon, TvIcon, FireIcon, MoonIcon, BookOpenIcon } from '@heroicons/react/24/outline';

// Draft data types
type TeamHaul = {
  team: string;
  picks: { round: number; pick: number; player: string; price?: number }[];
};

type LinearPick = {
  pick_no: number;
  round: number;
  pick: number; // pick within round
  team: string;
  player: string;
  price?: number;
  pos?: string;
};

type DraftYearData = {
  rounds: number;
  picks_per_round: number;
  team_hauls: TeamHaul[];
  // Auction metadata: if true, picks may include price
  isAuction?: boolean;
  linear_picks: LinearPick[];
};

type SleeperDraftSettings = {
  rounds?: number;
};

// Suggestions section will use EmptyState (no mock content)

export default function DraftPage() {
  const [selectedYear, setSelectedYear] = useState('2025');
  const years = useMemo(() => ['2025', ...Object.keys(LEAGUE_IDS.PREVIOUS)].sort((a, b) => parseInt(b) - parseInt(a)), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftsByYear, setDraftsByYear] = useState<Record<string, DraftYearData | null>>({});
  const playersRef = useRef<Record<string, SleeperPlayer> | null>(null);
  const loadedYearsRef = useRef<Set<string>>(new Set());
  const [draftView, setDraftView] = useState<'teams' | 'linear'>('teams');

  // Removed local classNames helper – primitives use tokenized styles

  // Download an ICS calendar file for the trip and draft
  const handleAddToCalendar = () => {
    try {
      const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      // Trip window (Thursday 3 PM ET -> Sunday 11 AM ET)
      const tripStart = new Date('2026-07-16T15:00:00-04:00');
      const tripEnd = new Date('2026-07-19T11:00:00-04:00');
      // Draft event (using league constant for start time)
      const draftStart = IMPORTANT_DATES.NEXT_DRAFT;
      const draftEnd = new Date(draftStart.getTime() + 2 * 60 * 60 * 1000); // 2 hours

      const now = new Date();
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//East v. West//Draft Trip//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:evw-trip-2026@eastvwest`,
        `DTSTAMP:${formatICSDate(now)}`,
        `DTSTART:${formatICSDate(tripStart)}`,
        `DTEND:${formatICSDate(tripEnd)}`,
        'SUMMARY:East v. West Draft Trip',
        'LOCATION:Somerset, Pennsylvania, United States',
        'DESCRIPTION:Airbnb: https://www.airbnb.com/rooms/21559127',
        'END:VEVENT',
        'BEGIN:VEVENT',
        `UID:evw-draft-2026@eastvwest`,
        `DTSTAMP:${formatICSDate(now)}`,
        `DTSTART:${formatICSDate(draftStart)}`,
        `DTEND:${formatICSDate(draftEnd)}`,
        'SUMMARY:East v. West Rookie Draft',
        'DESCRIPTION:Draft starts at 1:00 PM ET',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'evw-draft-trip-2026.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to create calendar file', e);
      alert('Could not generate calendar file.');
    }
  };

  useEffect(() => {
    const leagueId = selectedYear === '2025' 
      ? LEAGUE_IDS.CURRENT 
      : LEAGUE_IDS.PREVIOUS[selectedYear as keyof typeof LEAGUE_IDS.PREVIOUS];

    if (!leagueId) {
      setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
      return;
    }

    if (loadedYearsRef.current.has(selectedYear)) return;
    loadedYearsRef.current.add(selectedYear);

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [drafts, teams] = await Promise.all([
          getLeagueDrafts(leagueId),
          getTeamsData(leagueId),
        ]);

        if (!playersRef.current) {
          playersRef.current = await getAllPlayers();
        }

        const draft = drafts[0];
        if (!draft) {
          if (!cancelled) setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
          return;
        }

        const picks = await getDraftPicks(draft.draft_id);
        const rounds = picks.reduce((max, p) => Math.max(max, p.round), 0);
        const picksInRound1 = picks.filter(p => p.round === 1).length || teams.length;

        const byTeam = new Map<number, { round: number; pick: number; player: string; price?: number }[]>();
        const rosterIdToTeam = new Map<number, string>(teams.map(t => [t.rosterId, t.teamName]));
        const linearPicks: LinearPick[] = [];
        for (const p of picks) {
          const arr = byTeam.get(p.roster_id) || [];
          const player = playersRef.current?.[p.player_id];
          const name = player ? `${player.first_name} ${player.last_name}` : 'Unknown Player';
          // Attach price for auction drafts when present on pick
          // Sleeper stores auction bid in metadata.amount (string); fallback to root amount/price
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyPick = p as any;
          const metaAmountRaw = anyPick?.metadata?.amount;
          const metaAmount = typeof metaAmountRaw === 'string' && metaAmountRaw.trim() !== '' ? Number(metaAmountRaw) : undefined;
          const rootAmountRaw = anyPick?.amount ?? anyPick?.price;
          const rootAmount = typeof rootAmountRaw === 'string' ? Number(rootAmountRaw) : (typeof rootAmountRaw === 'number' ? rootAmountRaw : undefined);
          const price = Number.isFinite(metaAmount) ? (metaAmount as number) : (Number.isFinite(rootAmount) ? (rootAmount as number) : undefined);
          arr.push({ round: p.round, pick: p.draft_slot, player: name, price });
          byTeam.set(p.roster_id, arr);

          const teamName = rosterIdToTeam.get(p.roster_id) || 'Unknown Team';
          const overall = (typeof p.pick_no === 'number' && Number.isFinite(p.pick_no))
            ? (p.pick_no as number)
            : ((p.round - 1) * picksInRound1 + p.draft_slot);
          linearPicks.push({ pick_no: overall, round: p.round, pick: p.draft_slot, team: teamName, player: name, price, pos: player?.position });
        }

        const team_hauls: TeamHaul[] = [];
        for (const t of teams) {
          const arr = byTeam.get(t.rosterId) || [];
          team_hauls.push({
            team: t.teamName,
            picks: arr.sort((a, b) => (a.round === b.round ? a.pick - b.pick : a.round - b.round)),
          });
        }

        const data: DraftYearData = {
          rounds: rounds || ((draft.settings as SleeperDraftSettings | null | undefined)?.rounds ?? 0),
          picks_per_round: picksInRound1,
          team_hauls,
          isAuction: (draft.type || '').toLowerCase() === 'auction' || picks.some((pp) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyp = pp as any;
            return anyp?.metadata?.amount != null || anyp?.amount != null || anyp?.price != null;
          }),
          linear_picks: linearPicks.sort((a, b) => a.pick_no - b.pick_no),
        };

        if (!cancelled) setDraftsByYear(prev => ({ ...prev, [selectedYear]: data }));
      } catch (e) {
        console.error('Error loading draft data', e);
        if (!cancelled) {
          setError('Unable to load draft data at this time.');
          setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedYear]);

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Draft Central" />
      <div className="mt-6">
        <Tabs
          tabs={[
            {
              id: 'next',
              label: 'Next Draft',
              content: (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Next Draft: July 18, 2026</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CountdownTimer
                        targetDate={IMPORTANT_DATES.NEXT_DRAFT}
                        title="Countdown to Draft Day"
                        className="mb-4"
                      />
                      <div className="grid gap-4">
                        <Card className="evw-surface">
                          <CardHeader>
                            <CardTitle>Airbnb Information</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-semibold text-[var(--text)]">Listing</h4>
                                <p className="font-medium">Not Your Typical Mountain Cabin - Must See Photos</p>
                                <a
                                  href="https://www.airbnb.com/rooms/21559127?viralityEntryPoint=1&s=76&source_impression_id=p3_1751382164_P3PAwIqHxrQ87fn9"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--accent-strong)] hover:underline"
                                  aria-label="View Airbnb listing in a new tab"
                                >
                                  View on Airbnb
                                </a>
                              </div>
                              <div>
                                <h4 className="font-semibold text-[var(--text)]">Location</h4>
                                <p>Somerset, Pennsylvania, United States</p>
                              </div>
                              <div>
                                <h4 className="font-semibold text-[var(--text)]">Dates</h4>
                                <p>July 16-19, 2026 (Thursday-Sunday)</p>
                              </div>
                              <div>
                                <h4 className="font-semibold text-[var(--text)]">Notes</h4>
                                <ul className="list-disc pl-5">
                                  <li>Check-in: 3:00 PM Thursday</li>
                                  <li>Check-out: 11:00 AM Sunday</li>
                                  <li>Draft starts at 1:00 PM ET on Saturday</li>
                                  <li>Linens provided for all beds — please bring your own shower towels.</li>
                                </ul>
                              </div>

                              <div className="mt-2 pt-4 border-t border-[var(--border)]">
                                <h4 className="font-semibold text-[var(--text)] mb-2">Amenities</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2 flex items-center gap-2"><HomeIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Kitchen</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>Space where guests can cook their own meals</li>
                                      <li>Refrigerator</li>
                                      <li>Microwave</li>
                                      <li>Cooking basics (pots and pans, oil, salt and pepper)</li>
                                      <li>Dishes and silverware (bowls, chopsticks, plates, cups, etc.)</li>
                                      <li>Mini fridge</li>
                                      <li>Freezer</li>
                                      <li>Dishwasher</li>
                                      <li>Stove & Oven</li>
                                      <li>Coffee makers (regular + Keurig)</li>
                                      <li>Wine glasses</li>
                                      <li>Toaster</li>
                                      <li>Baking sheet</li>
                                      <li>Blender</li>
                                      <li>Barbecue utensils (grill tools, skewers, etc.)</li>
                                      <li>Dining table</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2 flex items-center gap-2"><TvIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Entertainment</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>98&quot; Hi‑Def TV</li>
                                      <li>Full bar area with mini fridge</li>
                                      <li>Full-size arcade games</li>
                                      <li>Dart board</li>
                                      <li>Bubble hockey game</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2 flex items-center gap-2"><FireIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Outdoor</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>Fire pit</li>
                                      <li>Outdoor furniture</li>
                                      <li>Outdoor dining area</li>
                                      <li>BBQ grill</li>
                                      <li>Plenty of parking</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2 flex items-center gap-2"><MoonIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Sleeping Arrangements</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>5 bedrooms total</li>
                                      <li>2 queen beds</li>
                                      <li>1 king bed</li>
                                      <li>2 bunk beds</li>
                                      <li>1 sofa bed</li>
                                      <li>2 single beds</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2 flex items-center gap-2"><HomeIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Comfort & Utilities</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>Washer &amp; dryer</li>
                                      <li>Geothermal A/C</li>
                                      <li>Wood fireplace &amp; geothermal heating</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4 md:col-span-2">
                                    <h5 className="font-semibold mb-2 flex items-center gap-2"><BookOpenIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Loft</h5>
                                    <p className="text-sm">
                                      The upstairs loft area includes a library with many books and a large shuffleboard game.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <div>
                          <Button onClick={handleAddToCalendar} variant="primary">Add to Calendar (.ics)</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ),
            },
            {
              id: 'past',
              label: 'Previous Drafts',
              content: (
                <Card>
                  <CardContent>
                    <div className="mb-6">
                      <Label htmlFor="year-select" className="mb-1 block">Select Year</Label>
                      <Select
                        id="year-select"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                      >
                        {years.map((year) => (
                          <option key={year} value={year}>
                            {year === '2023' ? 'Inaugural Draft' : `${year} Draft`}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {loading ? (
                      <LoadingState message="Loading draft data..." />
                    ) : error ? (
                      <ErrorState message={error} />
                    ) : draftsByYear[selectedYear] === undefined ? (
                      <EmptyState title="Select a year" message="Choose a year to view draft results." />
                    ) : draftsByYear[selectedYear] === null ? (
                      <EmptyState title="No draft data" message="No draft data available for the selected year." />
                    ) : (
                      <div className="space-y-8">
                        <div>
                          <h3 className="text-base font-semibold text-[var(--text)] mb-3">Draft Structure</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <Card>
                              <CardContent>
                                <div className="text-sm text-[var(--muted)]">Rounds</div>
                                <div className="text-2xl font-bold text-[var(--text)]">{draftsByYear[selectedYear]?.rounds}</div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent>
                                <div className="text-sm text-[var(--muted)]">Picks Per Round</div>
                                <div className="text-2xl font-bold text-[var(--text)]">{draftsByYear[selectedYear]?.picks_per_round}</div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-[var(--text)]">
                              {draftView === 'teams' ? 'Team Hauls' : 'Linear Picks'}
                            </h3>
                            <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
                              <Button
                                variant={draftView === 'teams' ? 'primary' : 'ghost'}
                                size="sm"
                                className="px-3"
                                onClick={() => setDraftView('teams')}
                              >
                                By Team
                              </Button>
                              <Button
                                variant={draftView === 'linear' ? 'primary' : 'ghost'}
                                size="sm"
                                className="px-3"
                                onClick={() => setDraftView('linear')}
                              >
                                Linear
                              </Button>
                            </div>
                          </div>
                          {draftView === 'teams' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {(draftsByYear[selectedYear]?.team_hauls ?? []).map((teamHaul, index) => {
                                const colors = getTeamColors(teamHaul.team);
                                const headerStyle = getTeamColorStyle(teamHaul.team, 'primary');
                                return (
                                  <Card key={index} className="hover-lift" style={{ borderColor: colors.primary }}>
                                    <CardHeader className="rounded-t-[var(--radius-card)]" style={headerStyle}>
                                      <CardTitle style={{ color: headerStyle.color }}>{teamHaul.team}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <ul className="space-y-1">
                                        {teamHaul.picks.map((pick, pickIndex) => (
                                          <li key={pickIndex} className="text-sm">
                                            {`Round ${pick.round}, Pick ${pick.pick}: ${pick.player}${selectedYear === '2023' && draftsByYear[selectedYear]?.isAuction && pick.price != null ? ` — $${pick.price}` : ''}`}
                                          </li>
                                        ))}
                                      </ul>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          ) : (
                            <Card className="overflow-x-auto">
                              <CardContent>
                                {(() => {
                                  const picks = draftsByYear[selectedYear]?.linear_picks ?? [];
                                  const byRound = new Map<number, LinearPick[]>();
                                  for (const p of picks) {
                                    const arr = byRound.get(p.round) || [];
                                    arr.push(p);
                                    byRound.set(p.round, arr);
                                  }
                                  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
                                  return rounds.map((r) => (
                                    <div key={r} className="mb-6">
                                      <div className="sticky top-0 z-10 bg-[var(--surface)]/80 backdrop-blur-sm text-base font-semibold text-[var(--muted)] -mx-2 px-2 py-1.5 border-b border-[var(--border)]">{`Round ${r}`}</div>
                                      <ul className="space-y-2 mt-2">
                                        {(byRound.get(r) || []).map((p) => {
                                          const colors = getTeamColors(p.team);
                                          const nameStyle = getTeamColorStyle(p.team);
                                          const priceEnabled = selectedYear === '2023' && draftsByYear[selectedYear]?.isAuction && p.price != null;
                                          return (
                                            <li
                                              key={p.pick_no}
                                              className="text-sm rounded-md"
                                              style={{
                                                borderLeft: `4px solid ${colors.secondary}`,
                                                backgroundColor: nameStyle.backgroundColor as string,
                                                color: nameStyle.color as string,
                                              }}
                                            >
                                              <div className="pl-3 py-2 flex items-start justify-between gap-3">
                                                <div className="flex items-start min-w-0">
                                                  <div 
                                                    className="w-12 h-12 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0"
                                                    style={nameStyle}
                                                  >
                                                    <Image
                                                      src={getTeamLogoPath(p.team)}
                                                      alt={p.team}
                                                      width={36}
                                                      height={36}
                                                      className="object-contain"
                                                      onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                        const parent = target.parentElement;
                                                        if (parent) {
                                                          const fallback = document.createElement('div');
                                                          fallback.className = 'flex items-center justify-center h-full w-full';
                                                          fallback.innerHTML = `<span class=\"text-xs font-bold\">${p.team.charAt(0)}</span>`;
                                                          parent.appendChild(fallback);
                                                        }
                                                      }}
                                                    />
                                                  </div>
                                                  <div className="min-w-0">
                                                    <div className="flex items-center justify-between gap-3">
                                                      <span className="font-medium truncate">{p.team}</span>
                                                      <span className="text-sm whitespace-nowrap opacity-90 font-semibold">{`Pick ${p.pick_no} • Rd ${p.round}, Pk ${p.pick}`}</span>
                                                    </div>
                                                    <div className="text-sm truncate">
                                                      <span className="truncate inline-block max-w-full align-middle">{p.player}</span>
                                                      {p.pos && (
                                                        <span
                                                          className="ml-2 align-middle px-1.5 py-0.5 rounded text-[10px]"
                                                          style={{
                                                            backgroundColor: (nameStyle.color as string) === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)',
                                                            color: nameStyle.color as string,
                                                          }}
                                                        >
                                                          {p.pos}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                                {priceEnabled && (
                                                  <div className="flex-shrink-0">
                                                    <span
                                                      className="inline-block px-2 py-0.5 rounded-full text-xs"
                                                      style={{
                                                        backgroundColor: (nameStyle.color as string) === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)',
                                                        color: nameStyle.color as string,
                                                      }}
                                                    >
                                                      {`$${p.price}`}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                      <div className="h-px bg-gradient-to-r from-[#be161e] to-[#bf9944] opacity-40 mt-4" />
                                    </div>
                                  ));
                                })()}
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
