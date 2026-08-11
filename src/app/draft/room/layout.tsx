'use client';

import { useEffect, useState, type ReactNode } from 'react';
import DraftRoomClosed from '@/components/draft/DraftRoomClosed';
import { canAccessDraftRoom } from '@/lib/draft/access';

type MeResp = {
  authenticated: boolean;
  isAdmin?: boolean;
  claims?: { team?: string };
};

export default function DraftRoomLayout({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResp | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: MeResp) => {
        if (mounted) setMe(j);
      })
      .catch(() => {
        if (mounted) setMe({ authenticated: false });
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-400 text-lg">Loading...</div>
      </div>
    );
  }

  const team = me.claims?.team || null;
  if (!canAccessDraftRoom(team, Boolean(me.isAdmin))) {
    return <DraftRoomClosed />;
  }

  return children;
}
