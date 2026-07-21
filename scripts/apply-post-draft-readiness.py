from __future__ import annotations

import re
import runpy
from pathlib import Path

STAMP = Path('.post-draft-readiness-applied')
PATCH_SOURCE = Path('scripts/post-draft-readiness-patch.txt')
DOSSIER_PATCH = Path('scripts/apply-post-draft-dossier.py')
PORTABILITY_PATCH = Path('scripts/apply-newsletter-portability.py')
START_LINE = "          python - <<'PY'"
END_LINE = "          PY"
YAML_INDENT = ' ' * 10


def run_portability_patch() -> None:
    if PORTABILITY_PATCH.exists():
        runpy.run_path(str(PORTABILITY_PATCH), run_name='__main__')


def apply_post_draft_rank_scope_fix() -> None:
    """Keep rookie-draft value on the eligible rookie/DEF scale.

    The dossier needs both an eligible-pool rank and an overall dynasty rank, but
    they are not interchangeable. Overall dynasty rank is useful context after a
    player is selected; it must never be subtracted from a rookie pick number or
    used to score reaches/steals in a 48-player rookie-and-defense draft.
    """
    route_path = Path('src/app/api/newsletter/route.ts')
    if route_path.exists():
        route_text = route_path.read_text(encoding='utf-8')

        route_text = re.sub(
            r"\n\s*const\s+current(?:Dynasty)?RankByName\s*=\s*new Map\([\s\S]{0,600}?\);\n",
            "\n",
            route_text,
            count=1,
        )

        map_match = re.search(
            r"(?m)^(?P<indent>\s*)prospectPool\s*=\s*players\.map\(",
            route_text,
        )
        if not map_match:
            raise RuntimeError('Post-draft rank fix could not locate the prospectPool map in route.ts')

        if 'const eligibleRankByName = new Map(' not in route_text:
            indent = map_match.group('indent')
            declaration = (
                f"{indent}// Normalize the exact eligible draft pool (rookies + defenses) to a 1..N board.\n"
                f"{indent}// Overall dynasty rank remains separate context and never drives rookie-pick value.\n"
                f"{indent}const eligiblePool = [...players].sort((a, b) =>\n"
                f"{indent}  (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name),\n"
                f"{indent});\n"
                f"{indent}const eligibleRankByName = new Map(\n"
                f"{indent}  eligiblePool.map((player, index) => [normalizeProspectName(player.name), index + 1]),\n"
                f"{indent});\n"
            )
            route_text = route_text[:map_match.start()] + declaration + route_text[map_match.start():]

        map_start = route_text.index('prospectPool = players.map', map_match.start())
        log_marker = route_text.find('post_draft research pool loaded', map_start)
        map_end = log_marker if log_marker >= 0 else min(len(route_text), map_start + 8000)
        block = route_text[map_start:map_end]
        block_lines = block.splitlines(keepends=True)
        replaced_rank = False
        for index, line in enumerate(block_lines):
            if 'rank:' not in line:
                continue
            if 'currentRank' in line or 'currentDynastyRank' in line or 'player.rank' in line:
                rank_start = line.index('rank:')
                value_start = line.find('value:', rank_start)
                if value_start >= 0:
                    block_lines[index] = (
                        line[:rank_start]
                        + 'rank: eligibleRankByName.get(normalizeProspectName(player.name)) ?? null, '
                        + line[value_start:]
                    )
                else:
                    block_lines[index] = re.sub(
                        r'rank:\s*.*?,',
                        'rank: eligibleRankByName.get(normalizeProspectName(player.name)) ?? null,',
                        line,
                        count=1,
                    )
                replaced_rank = True
                break
        if not replaced_rank and 'rank: eligibleRankByName.get(normalizeProspectName(player.name)) ?? null,' not in block:
            raise RuntimeError('Post-draft rank fix could not locate the rank field in the prospectPool mapper')
        route_text = route_text[:map_start] + ''.join(block_lines) + route_text[map_end:]
        route_path.write_text(route_text, encoding='utf-8')

    compose_path = Path('src/lib/newsletter/compose-step.ts')
    if compose_path.exists():
        compose_text = compose_path.read_text(encoding='utf-8')
        compose_text = re.sub(
            r"(?m)^\s*const\s+dynastyRankByName\s*=.*?;\n",
            '',
            compose_text,
            count=1,
        )
        compose_text = re.sub(
            r"(?m)^(?P<indent>\s*)rank:\s*rookieRankByName\.get\(normalize\(pick\.playerName\)\)\s*\?\?\s*dynastyRankByName\.get\(normalize\(pick\.playerName\)\)\s*\?\?\s*null,\s*$",
            r"\g<indent>rank: rookieRankByName.get(normalize(pick.playerName)) ?? null,",
            compose_text,
            count=1,
        )
        if 'dynastyRankByName.get(normalize(pick.playerName))' in compose_text:
            raise RuntimeError('Post-draft rank fix could not remove the overall-dynasty award fallback')

        compose_text = compose_text.replace(
            'CURRENT ROOKIE/DYNASTY RANK EVIDENCE:',
            'ELIGIBLE ROOKIE/DEF POOL RANK EVIDENCE (draft-value scale):',
        )
        compose_text = compose_text.replace('evidence rank ${rank ? `#${rank}` : \'unavailable\'}', 'eligible-pool rank ${rank ? `#${rank}` : \'unavailable\'}')
        compose_text = compose_text.replace('evidence rank #${chosen.rank}', 'eligible-pool rank #${chosen.rank}')
        compose_text = compose_text.replace('an evidence rank of #${chosen.rank}', 'an eligible-pool rank of #${chosen.rank}')
        compose_text = compose_text.replace('selection slot and evidence rank', 'selection slot and eligible-pool rank')

        rubric_anchor = 'Apply the same rubric to every franchise. HOW THEY GOT HERE must explain the actual transaction path and net cost.'
        rubric_replacement = (
            'Apply the same rubric to every franchise. VALUE must compare selection number only to the eligible '
            'rookie/DEF pool rank and actual alternatives still available, never to overall dynasty rank. HOW THEY '
            'GOT HERE must explain the actual transaction path and net cost.'
        )
        if rubric_anchor in compose_text:
            compose_text = compose_text.replace(rubric_anchor, rubric_replacement, 1)
        elif rubric_replacement not in compose_text:
            generic_anchor = 'Apply the same rubric to every franchise.'
            if generic_anchor in compose_text:
                compose_text = compose_text.replace(
                    generic_anchor,
                    generic_anchor + ' VALUE must compare selection number only to the eligible rookie/DEF pool rank and actual alternatives still available, never to overall dynasty rank.',
                    1,
                )
        compose_path.write_text(compose_text, encoding='utf-8')

    test_path = Path('src/lib/newsletter/__tests__/post-draft-readiness.test.ts')
    if test_path.exists():
        test_text = test_path.read_text(encoding='utf-8')
        import_line = "import { readFileSync as readRankScopeFile } from 'node:fs';\n"
        if import_line not in test_text:
            test_text = import_line + test_text
        marker = "describe('post-draft eligible-pool rank scope'"
        if marker not in test_text:
            test_text += '''\n\ndescribe('post-draft eligible-pool rank scope', () => {\n  it('does not use overall dynasty rank as rookie-draft value rank', () => {\n    const route = readRankScopeFile('src/app/api/newsletter/route.ts', 'utf8');\n    const compose = readRankScopeFile('src/lib/newsletter/compose-step.ts', 'utf8');\n\n    expect(route).toContain('eligibleRankByName');\n    expect(route).not.toContain('currentRankByName.get(normalizeProspectName(player.name))');\n    expect(compose).not.toContain('dynastyRankByName.get(normalize(pick.playerName))');\n  });\n});\n'''
        test_path.write_text(test_text, encoding='utf-8')

    print('[post-draft-rank-scope] Eligible rookie/DEF ranking separated from overall dynasty rank.')


def run_dossier_patch() -> None:
    if DOSSIER_PATCH.exists():
        runpy.run_path(str(DOSSIER_PATCH), run_name='__main__')

    apply_post_draft_rank_scope_fix()

    route_path = Path('src/app/api/newsletter/route.ts')
    if route_path.exists():
        route_text = route_path.read_text(encoding='utf-8')
        old = 'let postDraftTeamProfiles'
        if old in route_text:
            route_path.write_text(route_text.replace(old, 'const postDraftTeamProfiles', 1), encoding='utf-8')

    run_portability_patch()


def main() -> None:
    if STAMP.exists():
        print('[post-draft-readiness] Source patch already applied in this workspace.')
        run_dossier_patch()
        return

    lines = PATCH_SOURCE.read_text(encoding='utf-8').splitlines()
    start = lines.index(START_LINE) + 1
    end = lines.index(END_LINE, start)
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
