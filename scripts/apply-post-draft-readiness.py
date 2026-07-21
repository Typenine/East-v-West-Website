from __future__ import annotations

from pathlib import Path

STAMP = Path('.post-draft-readiness-applied')
PATCH_SOURCE = Path('.github/workflows/post-draft-readiness-patch.yml')
START_LINE = "          python - <<'PY'"
END_LINE = "          PY"
YAML_INDENT = ' ' * 10


def main() -> None:
    if STAMP.exists():
        print('[post-draft-readiness] Source patch already applied in this workspace.')
        return

    lines = PATCH_SOURCE.read_text(encoding='utf-8').splitlines()
    start = lines.index(START_LINE) + 1
    end = lines.index(END_LINE, start)

    # The action's Python statements are indented ten spaces by YAML. Embedded
    # multiline replacement strings intentionally contain lines with less
    # indentation, so remove exactly ten spaces only where they are present.
    code_lines = [line[len(YAML_INDENT):] if line.startswith(YAML_INDENT) else line for line in lines[start:end]]
    code = '\n'.join(code_lines) + '\n'

    # Normalize minor source wording that changed after the patch payload was
    # prepared but does not affect the target code structure.
    code = code.replace(
        '// Seed the player name cache so derive.ts can resolve player IDs',
        '// Seed the player name cache so derive.ts can resolve IDs',
    )

    # The payload's Python triple-quoted string evaluates these escape sequences
    # as actual line breaks. Normalize the source template literal to the same
    # representation before the exact replacement runs.
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

    # Final deterministic cleanup on the transformed TypeScript.
    compose_text = compose_path.read_text(encoding='utf-8')

    # Only awardsRaw is reassigned after the initial parallel generation.
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

    # Keep the optional trade section explicitly labeled for the selected draft
    # episode after filtering to the draft-week window. The generated source uses
    # literal backslash-n sequences inside the surrounding template string.
    old_trade_heading = 'PRE-DRAFT TRADE ANALYSIS — ${season}\\nReview trades since late ${season - 1} (post-championship offseason through the present).'
    new_trade_heading = "${analysisLabel} — ${season}\\n${isPostDraft ? 'Review completed trades from the seven days before through two days after the rookie draft. Focus on pick movement, trade-ups, trade-downs, and how the deals changed team hauls.' : 'Review offseason trades from the post-championship period through the present.'}"
    if old_trade_heading in compose_text:
        compose_text = compose_text.replace(old_trade_heading, new_trade_heading, 1)

    compose_path.write_text(compose_text, encoding='utf-8')

    # SleeperUser's shared type omits metadata even though the API payload may
    # include metadata.team_name. Use the same narrow cast used elsewhere.
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

    # This branch began before the current-main homepage typing fix. Add the
    # explicit false values only when building that older shape; on current main
    # these replacements are already present and therefore do nothing.
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


if __name__ == '__main__':
    main()
