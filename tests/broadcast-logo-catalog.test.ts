import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { TEAM_NAMES } from '@/lib/constants/league';
import {
  BROADCAST_LOGO_CATALOG,
  BROADCAST_TEAM_LOGO_FILES,
  getBroadcastLogoUrl,
  getBroadcastTeamLogoUrl,
  LEAGUE_BROADCAST_LOGO_URL,
} from '@/lib/constants/broadcast-logos';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

const publicAssetPath = (url: string) =>
  path.join(process.cwd(), 'public', decodeURIComponent(url).replace(/^\//, ''));

describe('East v. West 13-logo broadcast catalog', () => {
  it('has exactly 12 canonical teams and one league logo', () => {
    expect(TEAM_NAMES).toHaveLength(12);
    expect(Object.keys(BROADCAST_TEAM_LOGO_FILES).sort()).toEqual([...TEAM_NAMES].sort());
    expect(BROADCAST_LOGO_CATALOG).toHaveLength(13);
    expect(BROADCAST_LOGO_CATALOG.filter(asset => asset.kind === 'league')).toHaveLength(1);
  });

  it('resolves to real files already committed to the project', () => {
    for (const item of BROADCAST_LOGO_CATALOG) {
      expect(existsSync(publicAssetPath(item.src)), item.name + ': ' + item.src).toBe(true);
    }
  });

  it('matches the existing site helper for all teams', () => {
    for (const team of TEAM_NAMES) {
      expect(getBroadcastTeamLogoUrl(team)).toBe(getTeamLogoPath(team));
    }
  });

  it('preserves historical team aliases without inventing a fourteenth logo', () => {
    expect(getBroadcastTeamLogoUrl("Minshew's Maniacs")).toBe(getBroadcastTeamLogoUrl('Cascade Marauders'));
    expect(getBroadcastTeamLogoUrl("Gardner's Ghost")).toBe(getBroadcastTeamLogoUrl('Cascade Marauders'));
  });

  it('provides league fallback without replacing custom draft-event branding', () => {
    expect(getBroadcastLogoUrl({ league: true })).toBe(LEAGUE_BROADCAST_LOGO_URL);
    expect(getBroadcastLogoUrl({ eventLogoUrl: '/draft-logos/2026-draft-logo.png', league: true }))
      .toBe('/draft-logos/2026-draft-logo.png');
  });
});
