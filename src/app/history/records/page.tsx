import { redirect } from 'next/navigation';

export default function LegacyRecordsPage() {
  redirect('/history/stats?tab=records');
}
