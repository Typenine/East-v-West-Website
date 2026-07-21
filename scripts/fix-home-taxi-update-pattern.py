from pathlib import Path

path = Path('scripts/apply-home-taxi-update.py')
text = path.read_text(encoding='utf-8')
old = r'''        r"function isInOffseason\(\): boolean \{.*?\n\}",'''
new = r'''        r"function isInOffseason\(\): boolean \{.*?\n\}(?=\n\n/\*\*)",'''
if old in text:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
elif new not in text:
    raise RuntimeError('Unable to correct offseason replacement pattern')

# Vercel's persistent Data Cache survives deployments. Bump the rivalry hub
# cache version after normalizing the stored Cascade Marauders franchise name
# so the live page cannot continue serving the legacy pairing snapshot.
rivalry_path = Path('src/app/rivalries/page.tsx')
rivalry_text = rivalry_path.read_text(encoding='utf-8')
old_cache = "'permanent-rivalry-hub-v1'"
new_cache = "'permanent-rivalry-hub-v2'"
if old_cache in rivalry_text:
    rivalry_path.write_text(rivalry_text.replace(old_cache, new_cache, 1), encoding='utf-8')
elif new_cache not in rivalry_text:
    raise RuntimeError('Unable to refresh the permanent rivalry hub cache version')
