from __future__ import annotations

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
        old_declaration = (
            '          const currentRankByName = new Map(stagedDynastyRankings.map(player => '
            '[normalizeProspectName(player.name), player.rank]));'
        )
        new_declaration = '''          // Normalize the exact eligible draft pool (rookies + defenses) to a
          // 1..N board. Overall dynasty rank remains a separate context field and
          // is never used as the rookie-draft value scale.
          const eligiblePool = [...players].sort((a, b) =>
            (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name),
          );
          const eligibleRankByName = new Map(
            eligiblePool.map((player, index) => [normalizeProspectName(player.name), index + 1]),
          );'''
        if old_declaration in route_text:
            route_text = route_text.replace(old_declaration, new_declaration, 1)
        elif 'const eligibleRankByName = new Map(' not in route_text:
            raise RuntimeError('Post-draft rank fix could not find the overall-rank declaration in route.ts')

        old_rank = '              rank: currentRankByName.get(normalizeProspectName(player.name)) ?? player.rank ?? null,'
        new_rank = '              rank: eligibleRankByName.get(normalizeProspectName(player.name)) ?? null,'
        if old_rank in route_text:
            route_text = route_text.replace(old_rank, new_rank, 1)
        elif new_rank not in route_text:
            raise RuntimeError('Post-draft rank fix could not find the prospect rank assignment in route.ts')
        route_path.write_text(route_text, encoding='utf-8')

    dossier_path = Path('src/lib/newsletter/post-draft-dossier.ts')
    if dossier_path.exists():
        dossier_text = dossier_path.read_text(encoding='utf-8')
        dossier_text = dossier_text.replace(
            '  Rookie-board rank:',
            '  Eligible rookie/DEF pool rank:',
        )
        rule_anchor = '- Explain what the franchise acquired, what it surrendered, how the capital moved, and whether that cost changes the grade.'
        rank_rules = '''- Grade draft value only against the eligible rookie/DEF pool rank and the players actually available at that selection.
- Never compare or subtract current overall dynasty rank directly against rookie pick number; those are different scales.
- Overall dynasty rank may support long-term asset context, but it cannot by itself create a reach, steal, or low value score.
- Defenses are eligible draft assets in this league. Keep them in the eligible pool and evaluate their selection cost without pretending they have the same positional upside as rookies.
'''
        if rank_rules.strip() not in dossier_text:
            if rule_anchor not in dossier_text:
                raise RuntimeError('Post-draft rank fix could not find the dossier writing-rules anchor')
            dossier_text = dossier_text.replace(rule_anchor, rank_rules + rule_anchor, 1)
        dossier_path.write_text(dossier_text, encoding='utf-8')

    compose_path = Path('src/lib/newsletter/compose-step.ts')
    if compose_path.exists():
        compose_text = compose_path.read_text(encoding='utf-8')
        dynasty_declaration = '  const dynastyRankByName = new Map((dynastyRankings ?? []).map(player => [normalize(player.name), player.rank]));\n'
        if dynasty_declaration in compose_text:
            compose_text = compose_text.replace(dynasty_declaration, '', 1)

        old_award_rank = '    rank: rookieRankByName.get(normalize(pick.playerName)) ?? dynastyRankByName.get(normalize(pick.playerName)) ?? null,'
        new_award_rank = '    rank: rookieRankByName.get(normalize(pick.playerName)) ?? null,'
        if old_award_rank in compose_text:
            compose_text = compose_text.replace(old_award_rank, new_award_rank, 1)
        elif new_award_rank not in compose_text:
            raise RuntimeError('Post-draft rank fix could not find the award rank fallback')

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
            raise RuntimeError('Post-draft rank fix could not find the team-grade rubric anchor')
        compose_path.write_text(compose_text, encoding='utf-8')

    test_path = Path('src/lib/newsletter/__tests__/post-draft-readiness.test.ts')
    if test_path.exists():
        test_text = test_path.read_text(encoding='utf-8')
        import_line = "import { readFileSync as readRankScopeFile } from 'node:fs';\n"
        if import_line not in test_text:
            test_text = import_line + test_text
        marker = "describe('post-draft eligible-pool rank scope'"
        if marker not in test_text:
            test_text += '''\n\ndescribe('post-draft eligible-pool rank scope', () => {\n  it('does not use overall dynasty rank as rookie-draft value rank', () => {\n    const route = readRankScopeFile('src/app/api/newsletter/route.ts', 'utf8');\n    const compose = readRankScopeFile('src/lib/newsletter/compose-step.ts', 'utf8');\n    const dossier = readRankScopeFile('src/lib/newsletter/post-draft-dossier.ts', 'utf8');\n\n    expect(route).toContain('eligibleRankByName');\n    expect(route).not.toContain('currentRankByName.get(normalizeProspectName(player.name))');\n    expect(compose).not.toContain('dynastyRankByName.get(normalize(pick.playerName))');\n    expect(dossier).toContain('Eligible rookie/DEF pool rank');\n    expect(dossier).toContain('Never compare or subtract current overall dynasty rank directly against rookie pick number');\n  });\n});\n'''
        test_path.write_text(test_text, encoding='utf-8')

    print('[post-draft-rank-scope] Eligible rookie/DEF ranking separated from overall dynasty rank.')


def run_dossier_patch() -> None:
    if DOSSIER_PATCH.exists():
        runpy.run_path(str(DOSSIER_PATCH), run_name='__main__')

    apply_post_draft_rank_scope_fix()

    # The dossier profile packet is assembled once and never reassigned. Keep the
    # generated route compliant with the repository's blocking prefer-const rule.
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
