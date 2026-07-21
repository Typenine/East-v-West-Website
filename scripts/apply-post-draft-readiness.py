from __future__ import annotations

import runpy
from pathlib import Path

STAMP = Path('.post-draft-readiness-applied')
PATCH_SOURCE = Path('scripts/post-draft-readiness-patch.txt')
DOSSIER_PATCH = Path('scripts/apply-post-draft-dossier.py')
START_LINE = "          python - <<'PY'"
END_LINE = "          PY"
YAML_INDENT = ' ' * 10


def run_dossier_patch() -> None:
    if DOSSIER_PATCH.exists():
        runpy.run_path(str(DOSSIER_PATCH), run_name='__main__')

    # The dossier profile packet is assembled once and never reassigned. Keep the
    # generated route compliant with the repository's blocking prefer-const rule.
    route_path = Path('src/app/api/newsletter/route.ts')
    if route_path.exists():
        route_text = route_path.read_text(encoding='utf-8')
        old = 'let postDraftTeamProfiles'
        if old in route_text:
            route_path.write_text(route_text.replace(old, 'const postDraftTeamProfiles', 1), encoding='utf-8')


def main() -> None:
    if STAMP.exists():
        print('[post-draft-readiness] Source patch already applied in this workspace.')
        run_dossier_patch()
        return

    lines = PATCH_SOURCE.read_text(encoding='utf-8').splitlines()
    start = lines.index(START_LINE) + 1
    end = lines.index(END_LINE, start)

    # The patch payload retains its original indentation so embedded multiline
    # replacements remain exact. Remove only the ten-space wrapper indentation.
    code_lines = [line[len(YAML_INDENT):] if line.startswith(YAML_INDENT) else line for line in lines[start:end]]
    code = '\n'.join(code_lines) + '\n'

    code = code.replace(
        '// Seed the player name cache so derive.ts can resolve player IDs',
        '// Seed the player name cache so derive.ts can resolve IDs',
    )
    code = code.replace(
        "Path('.github/workflows/post-draft-readiness-patch.yml').unlink()",
        'pass  # legacy one-time workflow cleanup; payload is now stored under scripts/',
    )

    compose_path = Path('src/lib/newsletter/compose-step.ts')
    compose_text = compose_path.read_text(encoding='utf-8')
    escaped_westy = '  const westyCtx = `${cfg.ctx}\\n\\n---\\nMason Reed just closed the show with:\\n"${bot1}"\\n\\nNow give your final word.`;'
    multiline_westy = '''  const westyCtx = `${cfg.ctx}

---
Mason Reed just closed the show with:
"${bot1}"

Now give your final word.`;'''
    if escaped_westy in compose_text:
        compose_path.write_text(compose_text.replace(escaped_westy, multiline_westy, 1), encoding='utf-8')

    print('[post-draft-readiness] Applying staged post-draft source updates...')
    namespace = {'__name__': '__main__', '__file__': str(PATCH_SOURCE)}
    exec(compile(code, str(PATCH_SOURCE), 'exec'), namespace, namespace)

    compose_text = compose_path.read_text(encoding='utf-8')

    destructure = '  let [bot1_summary, bot2_summary, awardsRaw] = await Promise.all(['
    if destructure in compose_text:
        start_idx = compose_text.index(destructure)
        compose_text = compose_text.replace(
            destructure,
            '  const [bot1_summary, bot2_summary, initialAwardsRaw] = await Promise.all([',
            1,
        )
        close_idx = compose_text.index('  ]);', start_idx) + len('  ]);')
        compose_text = compose_text[:close_idx] + '\n  let awardsRaw = initialAwardsRaw;' + compose_text[close_idx:]

    old_trade_heading = 'PRE-DRAFT TRADE ANALYSIS — ${season}\\nReview trades since late ${season - 1} (post-championship offseason through the present).'
    new_trade_heading = "${analysisLabel} — ${season}\\n${isPostDraft ? 'Review completed trades from the seven days before through two days after the rookie draft. Focus on pick movement, trade-ups, trade-downs, and how the deals changed team hauls.' : 'Review offseason trades from the post-championship period through the present.'}"
    if old_trade_heading in compose_text:
        compose_text = compose_text.replace(old_trade_heading, new_trade_heading, 1)

    compose_path.write_text(compose_text, encoding='utf-8')

    ingest_path = Path('src/lib/newsletter/sleeper-ingest.ts')
    ingest_text = ingest_path.read_text(encoding='utf-8')
    old_user_map = '''  for (const user of users) {
    userNameById.set(
      user.user_id,
      user.metadata?.team_name || user.display_name || user.username || `User ${user.user_id}`,
    );
  }'''
    new_user_map = '''  for (const user of users) {
    const metadata = (user as SleeperUser & { metadata?: { team_name?: string } }).metadata;
    userNameById.set(
      user.user_id,
      metadata?.team_name || user.display_name || user.username || `User ${user.user_id}`,
    );
  }'''
    if old_user_map in ingest_text:
        ingest_text = ingest_text.replace(old_user_map, new_user_map, 1)
    ingest_path.write_text(ingest_text, encoding='utf-8')

    # The branch began before the latest homepage typing fix. This is a no-op on
    # current main and only lets the preview validate against the older branch tree.
    around_path = Path('src/components/home/AroundTheLeague.tsx')
    around_text = around_path.read_text(encoding='utf-8')
    for href in [
        '/api/export/rosters',
        '/api/export/rules',
        '/api/export/drafts',
        '/api/export/history',
        '/api/export/trades',
    ]:
        old = f"    href: '{href}',\n  }},"
        new = f"    href: '{href}',\n    featured: false,\n  }},"
        if old in around_text:
            around_text = around_text.replace(old, new, 1)
    around_path.write_text(around_text, encoding='utf-8')

    STAMP.write_text('applied\n', encoding='utf-8')
    print('[post-draft-readiness] Source updates applied.')
    run_dossier_patch()


if __name__ == '__main__':
    main()
