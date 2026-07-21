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
