from pathlib import Path

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
if old_mapping in rivalry_text:
    rivalry_text = rivalry_text.replace(old_mapping, new_mapping, 1)
elif new_mapping not in rivalry_text:
    raise RuntimeError('Unable to canonicalize the stored Cascade rivalry pair')

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
if old_score_panel in rivalry_text:
    rivalry_text = rivalry_text.replace(old_score_panel, new_score_panel, 1)
elif new_score_panel not in rivalry_text:
    raise RuntimeError('Unable to remove public rivalry-strength scores')

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

# Vercel's persistent Data Cache survives deployments. Use a new cache key so
# the normalized pairing and recovered Sleeper history are visible immediately.
for old_cache in ("'permanent-rivalry-hub-v1'", "'permanent-rivalry-hub-v2'"):
    if old_cache in rivalry_text:
        rivalry_text = rivalry_text.replace(old_cache, "'permanent-rivalry-hub-v3'", 1)
        break
else:
    if "'permanent-rivalry-hub-v3'" not in rivalry_text:
        raise RuntimeError('Unable to refresh the permanent rivalry hub cache version')

rivalry_path.write_text(rivalry_text, encoding='utf-8')
