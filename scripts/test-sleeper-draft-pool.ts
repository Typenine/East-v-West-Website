import { buildSleeperRookieDefPool, sleeperPoolLabel } from '../src/lib/draft/sleeper-player-pool';
import { getDraftBrandingDefaults } from '../src/lib/draft/branding-defaults';
import { getAllPlayersCached, getNFLState } from '../src/lib/utils/sleeper-api';

async function main() {
  const state = await getNFLState();
  console.log('nfl state', state.season, state.previous_season, state.season_type);

  const all = await getAllPlayersCached();
  const skill = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
  for (const ye of [0, 1]) {
    const rows = Object.values(all).filter((p) => {
      if (!skill.has((p.position || '').toUpperCase())) return false;
      if (Number(p.years_exp) !== ye) return false;
      if ((p.status || '') !== 'Active') return false;
      return Boolean(p.team);
    });
    console.log(
      `ye=${ye} active+team`,
      rows.length,
      rows.slice(0, 8).map((p) => `${p.first_name} ${p.last_name} ${p.position} ${p.team}`),
    );
  }

  for (const y of [2025, 2026, 2027, 2028]) {
    const pool = await buildSleeperRookieDefPool(y);
    const rookies = pool.filter((p) => p.pos !== 'DEF');
    const defs = pool.filter((p) => p.pos === 'DEF');
    console.log(
      sleeperPoolLabel(y),
      'rookies=',
      rookies.length,
      'def=',
      defs.length,
      'sample=',
      rookies
        .slice(0, 5)
        .map((p) => `${p.name}:${p.pos}:${p.nfl || '-'}`)
        .join(', '),
    );
    console.log(' branding', JSON.stringify(getDraftBrandingDefaults(y)));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
