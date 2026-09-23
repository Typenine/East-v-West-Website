/**
 * Year-aware draft event branding defaults.
 * Unknown years fall back to a generic "{year} Rookie Draft" + logo path convention.
 */

export type DraftBrandingDefaults = {
  eventName: string;
  eventLogoUrl: string;
  eventColor1: string;
  eventColor2: string;
};

const LEAGUE_PRIMARY = '#be161e';
const LEAGUE_SECONDARY = '#bf9944';

/** Known host-city / theme defaults for past and upcoming drafts. */
const KNOWN_YEAR_DEFAULTS: Record<number, Partial<DraftBrandingDefaults>> = {
  2026: {
    eventName: 'Pittsburgh 2026',
    eventLogoUrl: '/draft-logos/2026-draft-logo.png',
  },
  2027: {
    eventName: 'Denver 2027',
    eventLogoUrl: '/draft-logos/2027-draft-logo.png',
  },
};

export function getDraftBrandingDefaults(year: number): DraftBrandingDefaults {
  const y = Math.trunc(Number(year)) || new Date().getFullYear();
  const known = KNOWN_YEAR_DEFAULTS[y] || {};
  return {
    eventName: known.eventName || `${y} Rookie Draft`,
    eventLogoUrl: known.eventLogoUrl || `/draft-logos/${y}-draft-logo.png`,
    eventColor1: known.eventColor1 || LEAGUE_PRIMARY,
    eventColor2: known.eventColor2 || LEAGUE_SECONDARY,
  };
}
