from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise RuntimeError(f'Unable to apply {label}')


path = Path('scripts/apply-home-taxi-update.py')
text = path.read_text(encoding='utf-8')
old = r'''        r"function isInOffseason\(\): boolean \{.*?\n\}",'''
new = r'''        r"function isInOffseason\(\): boolean \{.*?\n\}(?=\n\n/\*\*)",'''
if old in text:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
elif new not in text:
    raise RuntimeError('Unable to correct offseason replacement pattern')

rivalry_path = Path('src/app/rivalries/page.tsx')
rivalry_text = rivalry_path.read_text(encoding='utf-8')

# Stored rivalry rows predate the Cascade Marauders rebrand. Normalize the
# locked pairing before ordering it or matching it to Sleeper history.
old_mapping = '''          .map((pair) => orientPair({
            ...pair,
            teamAScoreForB: Number(pair.teamAScoreForB || 0),
            teamBScoreForA: Number(pair.teamBScoreForA || 0),
            combinedScore: Number(pair.combinedScore || 0),
          }))'''
new_mapping = '''          .map((pair) => orientPair({
            ...pair,
            teamAId: ["Minshew's Maniacs", "Gardner's Ghost", 'K9 Minshew II'].includes(pair.teamAId)
              ? 'Cascade Marauders'
              : pair.teamAId,
            teamBId: ["Minshew's Maniacs", "Gardner's Ghost", 'K9 Minshew II'].includes(pair.teamBId)
              ? 'Cascade Marauders'
              : pair.teamBId,
            teamAScoreForB: Number(pair.teamAScoreForB || 0),
            teamBScoreForA: Number(pair.teamBScoreForA || 0),
            combinedScore: Number(pair.combinedScore || 0),
          }))'''
rivalry_text = replace_once(rivalry_text, old_mapping, new_mapping, 'Cascade rivalry canonicalization')

# Keep Blood Feud status visible, but do not expose the private rivalry-strength
# ballot values or combined score anywhere in the public rivalry dossier.
old_score_panel = '''            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <section>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">How the rivalry was formed</div>
                <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-4">
                  {pair.combinedScore > 0 ? (
                    <>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--muted)]">{pair.teamAId} assigned</span>
                        <strong className="text-[var(--text)]">{pair.teamAScoreForB}</strong>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--muted)]">{pair.teamBId} assigned</span>
                        <strong className="text-[var(--text)]">{pair.teamBScoreForA}</strong>
                      </div>
                      <div className="mt-3 border-t border-[var(--border)] pt-3 text-center">
                        <div className="text-3xl font-black text-[var(--text)]">{pair.combinedScore}</div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Combined rivalry strength</div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-[var(--muted)]">This permanent pairing was established through the league’s Rivalry Strength process.</p>
                  )}
                </div>
              </section>

              <section>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Series benchmarks</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <StatTile label="Closest finish" value={rivalry.closestGame ? formatPoints(rivalry.closestGame.margin) : '—'} detail={gameLabel(rivalry.closestGame, pair)} />
                  <StatTile label="Largest win" value={rivalry.largestWin ? formatPoints(rivalry.largestWin.margin) : '—'} detail={gameLabel(rivalry.largestWin, pair)} />
                  <StatTile label="Highest combined" value={rivalry.highestCombined ? formatPoints(rivalry.highestCombined.combined) : '—'} detail={gameLabel(rivalry.highestCombined, pair)} />
                </div>
              </section>
            </div>'''
new_score_panel = '''            <section>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Series benchmarks</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <StatTile label="Closest finish" value={rivalry.closestGame ? formatPoints(rivalry.closestGame.margin) : '—'} detail={gameLabel(rivalry.closestGame, pair)} />
                <StatTile label="Largest win" value={rivalry.largestWin ? formatPoints(rivalry.largestWin.margin) : '—'} detail={gameLabel(rivalry.largestWin, pair)} />
                <StatTile label="Highest combined" value={rivalry.highestCombined ? formatPoints(rivalry.highestCombined.combined) : '—'} detail={gameLabel(rivalry.highestCombined, pair)} />
              </div>
            </section>'''
rivalry_text = replace_once(rivalry_text, old_score_panel, new_score_panel, 'rivalry score removal')

rivalry_text = rivalry_text.replace(
    'Set by the Rivalry Strength process',
    'Locked as permanent matchups',
    1,
)
rivalry_text = rivalry_text.replace(
    'The pairings were established through the league’s Rivalry Strength system, including mutual scores and automatic Blood Feuds where applicable.',
    'The pairings were established by the league in 2026, with Blood Feud status retained where applicable.',
    1,
)

# Mobile uses full-width team rows with a centered divider. Desktop retains the
# side-by-side broadcast matchup treatment.
old_team_side = '''function TeamSide({ team, wins, points, align }: { team: string; wins: number; points: number; align: 'left' | 'right' }) {
  const colors = getTeamColors(team);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-lg sm:h-20 sm:w-20"
        style={{ background: colors.primary, boxShadow: `0 10px 24px ${colors.primary}35, inset 0 0 0 1px rgba(255,255,255,.12)` }}
      >
        <Image src={getTeamLogoPath(team)} alt={`${team} logo`} width={72} height={72} className="h-[86%] w-[86%] object-contain" />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-black leading-tight text-[var(--text)] sm:text-xl">{team}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          <span><strong className="text-[var(--text)]">{wins}</strong> series wins</span>
          <span>{formatPoints(points)} points</span>
        </div>
        <div className="mt-2 h-1 w-16 rounded-full" style={{ background: colors.secondary || colors.primary, marginLeft: align === 'right' ? 'auto' : undefined }} />
      </div>
    </div>
  );
}'''
new_team_side = '''function TeamSide({ team, wins, points, align }: { team: string; wins: number; points: number; align: 'left' | 'right' }) {
  const colors = getTeamColors(team);
  const right = align === 'right';
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-black/10 p-3 sm:flex-1 sm:border-0 sm:bg-transparent sm:p-0 ${right ? 'sm:flex-row-reverse sm:text-right' : ''}`}>
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-lg sm:h-20 sm:w-20 sm:rounded-2xl"
        style={{ background: colors.primary, boxShadow: `0 10px 24px ${colors.primary}35, inset 0 0 0 1px rgba(255,255,255,.12)` }}
      >
        <Image src={getTeamLogoPath(team)} alt={`${team} logo`} width={72} height={72} className="h-[86%] w-[86%] object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-sm font-black leading-tight text-[var(--text)] sm:text-xl">{team}</h2>
        <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)] sm:mt-2 sm:text-xs ${right ? 'sm:justify-end' : ''}`}>
          <span><strong className="text-[var(--text)]">{wins}</strong> series wins</span>
          <span>{formatPoints(points)} points</span>
        </div>
        <div className={`mt-2 h-1 w-14 rounded-full sm:w-16 ${right ? 'sm:ml-auto' : ''}`} style={{ background: colors.secondary || colors.primary }} />
      </div>
    </div>
  );
}'''
rivalry_text = replace_once(rivalry_text, old_team_side, new_team_side, 'responsive team rows')

old_matchup = '''        <div className="flex items-center gap-3 sm:gap-6">
          <TeamSide team={pair.teamAId} wins={rivalry.teamAWins} points={rivalry.teamAPoints} align="left" />
          <div className="shrink-0 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/70 bg-black/35 text-sm font-black text-white shadow-lg sm:h-14 sm:w-14">VS</div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{meetings} meetings</div>
          </div>
          <TeamSide team={pair.teamBId} wins={rivalry.teamBWins} points={rivalry.teamBPoints} align="right" />
        </div>'''
new_matchup = '''        <div className="grid gap-3 sm:flex sm:items-center sm:gap-6">
          <TeamSide team={pair.teamAId} wins={rivalry.teamAWins} points={rivalry.teamAPoints} align="left" />
          <div className="flex items-center gap-3 sm:block sm:shrink-0 sm:text-center">
            <div className="h-px flex-1 bg-[var(--border)] sm:hidden" />
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-400/70 bg-black/35 text-xs font-black text-white shadow-lg sm:h-14 sm:w-14 sm:text-sm">VS</div>
            <div className="h-px flex-1 bg-[var(--border)] sm:hidden" />
            <div className="hidden text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] sm:mt-2 sm:block">{meetings} meetings</div>
          </div>
          <TeamSide team={pair.teamBId} wins={rivalry.teamBWins} points={rivalry.teamBPoints} align="right" />
          <div className="text-center text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] sm:hidden">{meetings} meetings</div>
        </div>'''
rivalry_text = replace_once(rivalry_text, old_matchup, new_matchup, 'stacked mobile matchup')

rivalry_text = rivalry_text.replace(
    'className="mb-4 flex items-center justify-between gap-3"',
    'className="mb-4 flex flex-wrap items-center justify-between gap-2"',
    1,
)
rivalry_text = rivalry_text.replace(
    'className="flex items-center gap-2"',
    'className="flex flex-wrap items-center justify-end gap-2"',
    1,
)
rivalry_text = rivalry_text.replace(
    'className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4"',
    'className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"',
    1,
)
rivalry_text = rivalry_text.replace(
    'className="border-t border-[var(--border)] px-4 py-4 sm:px-5"',
    'className="border-t border-[var(--border)] px-3 py-3 sm:px-5 sm:py-4"',
    1,
)
rivalry_text = rivalry_text.replace(
    'className="flex items-end justify-between gap-3"',
    'className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3"',
    1,
)

old_history = '''              {rivalry.games.length > 0 ? (
                <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="bg-black/20 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2.5">Season</th>
                        <th className="px-3 py-2.5">Week</th>
                        <th className="px-3 py-2.5">{pair.teamAId}</th>
                        <th className="px-3 py-2.5">{pair.teamBId}</th>
                        <th className="px-3 py-2.5">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rivalry.games.map((game) => (
                        <tr key={`${game.season}-${game.week}`} className="border-t border-[var(--border)] bg-[var(--surface)]/50">
                          <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{game.season}</td>
                          <td className="px-3 py-2.5 text-[var(--muted)]">
                            <span>Week {game.week}</span>
                            {game.rivalryWeek ? <span className="ml-2 rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Rivalry</span> : null}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{formatPoints(game.teamAPoints)}</td>
                          <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{formatPoints(game.teamBPoints)}</td>
                          <td className="px-3 py-2.5 text-[var(--muted)]">{game.winner ? `${game.winner} by ${formatPoints(game.margin)}` : 'Tie'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : ('''
new_history = '''              {rivalry.games.length > 0 ? (
                <>
                  <div className="mt-3 space-y-2 sm:hidden">
                    {rivalry.games.map((game) => (
                      <div key={`${game.season}-${game.week}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm text-[var(--text)]">{game.season} · Week {game.week}</strong>
                          {game.rivalryWeek ? <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Rivalry</span> : null}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-black/15 p-2">
                            <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{pair.teamAId}</div>
                            <div className="mt-1 text-base font-black text-[var(--text)]">{formatPoints(game.teamAPoints)}</div>
                          </div>
                          <div className="rounded-lg bg-black/15 p-2 text-right">
                            <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{pair.teamBId}</div>
                            <div className="mt-1 text-base font-black text-[var(--text)]">{formatPoints(game.teamBPoints)}</div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{game.winner ? `${game.winner} by ${formatPoints(game.margin)}` : 'Tie'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 hidden overflow-x-auto rounded-xl border border-[var(--border)] sm:block">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-black/20 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        <tr>
                          <th className="px-3 py-2.5">Season</th>
                          <th className="px-3 py-2.5">Week</th>
                          <th className="px-3 py-2.5">{pair.teamAId}</th>
                          <th className="px-3 py-2.5">{pair.teamBId}</th>
                          <th className="px-3 py-2.5">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rivalry.games.map((game) => (
                          <tr key={`${game.season}-${game.week}`} className="border-t border-[var(--border)] bg-[var(--surface)]/50">
                            <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{game.season}</td>
                            <td className="px-3 py-2.5 text-[var(--muted)]">
                              <span>Week {game.week}</span>
                              {game.rivalryWeek ? <span className="ml-2 rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Rivalry</span> : null}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{formatPoints(game.teamAPoints)}</td>
                            <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{formatPoints(game.teamBPoints)}</td>
                            <td className="px-3 py-2.5 text-[var(--muted)]">{game.winner ? `${game.winner} by ${formatPoints(game.margin)}` : 'Tie'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : ('''
rivalry_text = replace_once(rivalry_text, old_history, new_history, 'mobile matchup history cards')

rivalry_text = rivalry_text.replace(
    'className="container mx-auto px-4 py-8"',
    'className="container mx-auto px-3 py-5 sm:px-4 sm:py-8"',
    1,
)
rivalry_text = rivalry_text.replace(
    'className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6"',
    'className="grid grid-cols-2 gap-2 p-3 sm:gap-4 sm:p-6 lg:grid-cols-4"',
    1,
)
rivalry_text = rivalry_text.replace(
    'className="space-y-6"',
    'className="space-y-4 sm:space-y-6"',
    1,
)
rivalry_text = rivalry_text.replace(
    'className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"',
    'className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6"',
    1,
)

# Vercel's persistent Data Cache survives deployments. Use a stable refreshed
# key for the normalized pairing and recovered Sleeper history.
for old_cache in ("'permanent-rivalry-hub-v1'", "'permanent-rivalry-hub-v2'"):
    if old_cache in rivalry_text:
        rivalry_text = rivalry_text.replace(old_cache, "'permanent-rivalry-hub-v3'", 1)
        break
else:
    if "'permanent-rivalry-hub-v3'" not in rivalry_text:
        raise RuntimeError('Unable to refresh the permanent rivalry hub cache version')

rivalry_path.write_text(rivalry_text, encoding='utf-8')
