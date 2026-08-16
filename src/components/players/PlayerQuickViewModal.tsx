"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import Tabs from "@/components/ui/Tabs";
import LoadingState from "@/components/ui/loading-state";
import ErrorState from "@/components/ui/error-state";
import PlayerGameLogSection from "@/components/players/PlayerGameLogSection";
import PlayerHonorsSection from "@/components/players/PlayerHonorsSection";
import {
  PlayerHeaderSection,
  PlayerOverviewSection,
  PlayerNFLProductionSection,
  PlayerEVWCareerSection,
  PlayerSeasonHistorySection,
  PlayerTransactionsSection,
} from "@/components/players/PlayerProfileSections";
import type { PlayerProfileWithHonors } from "@/lib/types/player-honors";

export interface PlayerQuickViewModalProps {
  open: boolean;
  onClose: () => void;
  /** Sleeper player id to load. Modal renders closed (no fetch) when null. */
  playerId: string | null;
  /** Optional label shown as the modal title while the profile is still loading. */
  name?: string;
}

/**
 * Site-wide quick-view modal for a player's profile. Fetches the same profile shape
 * the canonical /players/[playerId] page renders server-side and reuses its sections
 * across tabs instead of stacking them vertically.
 */
export default function PlayerQuickViewModal({ open, onClose, playerId, name }: PlayerQuickViewModalProps) {
  const [profile, setProfile] = useState<PlayerProfileWithHonors | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !playerId) return;
    let cancelled = false;
    setProfile(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/players/${encodeURIComponent(playerId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 404 ? "Player not found" : "Failed to load player");
        const data = (await res.json()) as PlayerProfileWithHonors;
        if (!cancelled) setProfile(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load player");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, playerId]);

  const title = profile?.identity.fullName ?? name ?? "Player";

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {loading && <LoadingState message="Loading player..." />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && profile && (
        <div className="space-y-4">
          <PlayerHeaderSection profile={profile} />
          <Tabs
            lazyPanels
            lazyMode="mount-once"
            tabs={[
              { id: "overview", label: "Overview", content: <PlayerOverviewSection profile={profile} /> },
              ...(profile.honors.length > 0
                ? [{ id: "honors", label: "Honors", content: <PlayerHonorsSection honors={profile.honors} /> }]
                : []),
              { id: "nfl", label: "NFL Production", content: <PlayerNFLProductionSection profile={profile} /> },
              { id: "evw", label: "EVW Career", content: <PlayerEVWCareerSection profile={profile} /> },
              { id: "game-log", label: "Game Log", content: <PlayerGameLogSection profile={profile} /> },
              { id: "seasons", label: "Season History", content: <PlayerSeasonHistorySection profile={profile} /> },
              { id: "transactions", label: "Transactions", content: <PlayerTransactionsSection profile={profile} /> },
            ]}
          />
          <div className="pt-2 border-t border-[var(--border)]">
            <Link
              href={`/players/${encodeURIComponent(profile.identity.playerId)}`}
              data-player-profile-full="true"
              className="text-sm text-[var(--accent)] hover:underline underline-offset-2"
            >
              View full profile →
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
