import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdminCookieValue } from '@/lib/auth/admin';

export default async function ProjectionControlsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  if (!isAdminCookieValue(cookieStore.get('evw_admin')?.value)) redirect('/');
  return children;
}
