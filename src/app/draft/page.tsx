'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getTeamColors, getTeamColorStyle } from '@/lib/utils/team-utils';

// Draft data types
type TeamHaul = {
  team: string;
  picks: { round: number; pick: number; player: string; price?: number }[];
};

type DraftYearData = {
  rounds: number;
  picks_per_round: number;
  team_hauls: TeamHaul[];
  // Auction metadata: if true, picks may include price
  isAuction?: boolean;
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
                                </ul>
                              </div>

                              <div>
                                <h4 className="font-semibold text-[var(--text)] mb-2">Amenities</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2">Kitchen</h5>
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
                                      <li>Coffee maker</li>
                                      <li>Wine glasses</li>
                                      <li>Toaster</li>
                                      <li>Baking sheet</li>
                                      <li>Blender</li>
                                      <li>Barbecue utensils (grill tools, skewers, etc.)</li>
                                      <li>Dining table</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2">Entertainment</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>98&quot; Hi‑Def TV</li>
                                      <li>Full bar area with mini fridge</li>
                                      <li>Full-size arcade games</li>
                                      <li>Dart board</li>
                                      <li>Bubble hockey game</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2">Outdoor</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>Fire pit</li>
                                      <li>Outdoor furniture</li>
                                      <li>Outdoor dining area</li>
                                      <li>BBQ grill</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4">
                                    <h5 className="font-semibold mb-2">Sleeping Arrangements</h5>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      <li>5 bedrooms total</li>
                                      <li>2 queen beds</li>
                                      <li>1 king bed</li>
                                      <li>2 bunk beds</li>
                                      <li>1 sofa bed</li>
                                      <li>2 single beds</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-[var(--border)] p-4 md:col-span-2">
                                    <h5 className="font-semibold mb-2">Loft</h5>
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
                          <h3 className="text-base font-semibold text-[var(--text)] mb-3">Team Hauls</h3>
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
