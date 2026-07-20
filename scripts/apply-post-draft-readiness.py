from __future__ import annotations

from pathlib import Path
import textwrap

STAMP = Path('.post-draft-readiness-applied')
PATCH_SOURCE = Path('.github/workflows/post-draft-readiness-patch.yml')
START_MARKER = "          python - <<'PY'\n"
END_MARKER = "\n          PY\n"


def main() -> None:
    if STAMP.exists():
        print('[post-draft-readiness] Source patch already applied in this workspace.')
        return

    source = PATCH_SOURCE.read_text(encoding='utf-8')
    start = source.index(START_MARKER) + len(START_MARKER)
    end = source.index(END_MARKER, start)
    code = textwrap.dedent(source[start:end])

    print('[post-draft-readiness] Applying staged post-draft source updates...')
    namespace = {'__name__': '__main__', '__file__': str(PATCH_SOURCE)}
    exec(compile(code, str(PATCH_SOURCE), 'exec'), namespace, namespace)
    STAMP.write_text('applied\n', encoding='utf-8')
    print('[post-draft-readiness] Source updates applied.')


if __name__ == '__main__':
    main()
