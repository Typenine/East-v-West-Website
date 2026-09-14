from __future__ import annotations

from pathlib import Path
import runpy

CANONICAL = Path('src/lib/newsletter/compose-step.ts')
CORE = Path('src/lib/newsletter/compose-step-core.ts')
LEGACY_PATCH = Path('scripts/apply-post-draft-readiness-core.py')
SHIM = "export * from './compose-step-weekly';\n"


def main() -> None:
    if not CANONICAL.exists() or not CORE.exists() or not LEGACY_PATCH.exists():
        raise RuntimeError('Weekly recap compatibility files are missing')

    canonical_before = CANONICAL.read_text(encoding='utf-8')
    CANONICAL.write_text(CORE.read_text(encoding='utf-8'), encoding='utf-8')
    try:
        runpy.run_path(str(LEGACY_PATCH), run_name='__main__')
        CORE.write_text(CANONICAL.read_text(encoding='utf-8'), encoding='utf-8')
    finally:
        CANONICAL.write_text(SHIM if 'compose-step-weekly' in canonical_before else canonical_before, encoding='utf-8')


if __name__ == '__main__':
    main()
