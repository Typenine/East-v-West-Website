from __future__ import annotations

from pathlib import Path
import runpy

CANONICAL = Path('src/lib/newsletter/compose-step.ts')
CORE = Path('src/lib/newsletter/compose-step-core.ts')
LEGACY_PATCH = Path('scripts/apply-post-draft-readiness-core.py')
MEMORY_PATCH = Path('scripts/apply-newsletter-memory-lifecycle.py')
SHIM = "export * from './compose-step-weekly';\n"


def main() -> None:
    if not CANONICAL.exists() or not CORE.exists() or not LEGACY_PATCH.exists() or not MEMORY_PATCH.exists():
        raise RuntimeError('Weekly recap compatibility files are missing')

    canonical_before = CANONICAL.read_text(encoding='utf-8')
    CANONICAL.write_text(CORE.read_text(encoding='utf-8'), encoding='utf-8')
    try:
        runpy.run_path(str(LEGACY_PATCH), run_name='__main__')
        CORE.write_text(CANONICAL.read_text(encoding='utf-8'), encoding='utf-8')
    finally:
        CANONICAL.write_text(SHIM if 'compose-step-weekly' in canonical_before else canonical_before, encoding='utf-8')

    # Keep newsletter memory persistence/cross-season carry in the normal prebuild
    # path so local, preview, and production builds all receive the same behavior.
    runpy.run_path(str(MEMORY_PATCH), run_name='__main__')


if __name__ == '__main__':
    main()
