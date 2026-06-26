'use client';

import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import MyTeamCardView from '@/components/home/MyTeamCardView';
import {
  useMyTeamDashboard,
  type MyTeamData,
} from '@/components/home/useMyTeamDashboard';

export type { MyTeamData } from '@/components/home/useMyTeamDashboard';

// Thin entry point. Team dashboard loading and rendering live in the dedicated hook and view.
export default function MyTeamCard({
  data,
  phase,
}: {
  data: MyTeamData;
  phase: HomepagePhase;
}) {
  return <MyTeamCardView model={useMyTeamDashboard(data, phase)} />;
}
