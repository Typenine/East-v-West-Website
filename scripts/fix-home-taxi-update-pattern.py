from pathlib import Path

path = Path('scripts/apply-home-taxi-update.py')
text = path.read_text(encoding='utf-8')
old = r'''        r"function isInOffseason\(\): boolean \{.*?\n\}",'''
new = r'''        r"function isInOffseason\(\): boolean \{.*?\n\}(?=\n\n/\*\*)",'''
if old in text:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
elif new not in text:
    raise RuntimeError('Unable to correct offseason replacement pattern')
