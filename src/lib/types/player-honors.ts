import type { PlayerProfile } from '@/lib/types/player';

export type PlayerHonorKind = 'all_evw_first' | 'all_evw_second' | 'mvp' | 'rookie_of_year';

export interface PlayerHonor {
  id: string;
  season: string;
  kind: PlayerHonorKind;
  label: string;
  position?: string | null;
  slot?: string | null;
  source: 'statistical' | 'official';
}

export type PlayerProfileWithHonors = PlayerProfile & {
  honors: PlayerHonor[];
};
