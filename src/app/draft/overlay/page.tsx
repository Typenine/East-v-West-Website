"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TeamBadge from "@/components/teams/TeamBadge";

type DraftOverview = {
  id: string;
  year: number;
  rounds: number;
  clockSeconds: number;
  status: "NOT_STARTED" | "LIVE" | "PAUSED" | "COMPLETED";
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  curOverall: number;
  onClockTeam?: string | null;
  clockStartedAt?: string | null;
  deadlineTs?: string | null;
  recentPicks: Array<{ overall: number; round: number; team: string; playerId: string; playerName?: string | null; madeAt: string }>;
  upcoming: Array<{ overall: number; round: number; team: string }>;
};

type GsapLike = {
  fromTo: (target: Element | null, fromVars: Record<string, unknown>, toVars: Record<string, unknown>) => unknown;
  to: (target: Element | null, vars: Record<string, unknown>) => unknown;
  killTweensOf: (target: Element | null) => unknown;
};

declare global {
  interface Window {
    gsap?: GsapLike;
  }
}

export default function DraftOverlayPage() {
  const [draft, setDraft] = useState<DraftOverview | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [available, setAvailable] = useState<Array<{ id: string; name: string; pos: string; nfl: string }>>([]);
  const [usingCustom, setUsingCustom] = useState(false);
  const gsapRef = useRef<GsapLike | null>(null);
  const pickBannerRef = useRef<HTMLDivElement | null>(null);
  const [lastOverallSeen, setLastOverallSeen] = useState<number | null>(null);
  const [showPickBanner, setShowPickBanner] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [lastUpdateMs, setLastUpdateMs] = useState<number>(Date.now());
  const [tick, setTick] = useState(0);

  const lastPick = draft?.recentPicks?.length ? draft.recentPicks[draft.recentPicks.length - 1] : null;
  const load = useCallback(async () => {
    const res = await fetch("/api/draft?include=available", { cache: "no-store" });
    const j = await res.json();
    const d = (j?.draft as DraftOverview) || null;
    setDraft(d);
    setRemainingSec(j?.remainingSec ?? null);
    setLastUpdateMs(Date.now());
    setAvailable(j?.available || []);
    setUsingCustom(Boolean(j?.usingCustom));
    const curLast = d?.recentPicks?.length ? d.recentPicks[d.recentPicks.length - 1].overall : null;
    if (curLast && curLast !== lastOverallSeen) {
      setLastOverallSeen(curLast);
      if (pickBannerRef.current && gsapRef.current) {
        setShowPickBanner(true);
        const gsap = gsapRef.current;
        gsap.killTweensOf(pickBannerRef.current);
        gsap.fromTo(
          pickBannerRef.current,
          { y: 60, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }
        );
        setTimeout(() => {
          if (pickBannerRef.current) {
            gsap.to(pickBannerRef.current, { y: -30, opacity: 0, duration: 0.5, ease: "power2.in", onComplete: () => setShowPickBanner(false) });
          }
        }, 2500);
      }
    }
  }, [lastOverallSeen]);

  useEffect(() => {
    const ensureGsap = () => new Promise<void>((resolve) => {
      if (gsapRef.current || typeof window === 'undefined') return resolve();
      if (window.gsap) { gsapRef.current = window.gsap!; return resolve(); }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
      script.async = true;
      script.onload = () => { gsapRef.current = window.gsap || null; resolve(); };
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
    void ensureGsap();
    load();
    const t = setInterval(load, 3000);
    return () => { clearInterval(t); };
  }, [load]);

  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const nowMs = Date.now() + tick * 0; // tie to tick for repaint
  const s = Math.max(0, (remainingSec || 0) - Math.floor((nowMs - lastUpdateMs) / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  const clockDisplay = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  useEffect(() => {
    const i = setInterval(() => setTickerIndex((x) => (x + 1) % 3), 5000);
    return () => clearInterval(i);
  }, []);

  const onClockTeam = draft?.onClockTeam || null;
  const infoBlocks = [
    { key: "recent", title: "Recent Picks", content: (draft?.recentPicks || []).slice(-5).reverse().map((p) => `#${p.overall} R${p.round} ${p.team} — ${p.playerName || p.playerId}`) },
    { key: "upcoming", title: "Upcoming", content: (draft?.upcoming || []).slice(0, 5).map((u) => `#${u.overall} R${u.round} — ${u.team}`) },
    { key: "available", title: usingCustom ? "Available (Custom)" : "Available", content: (available || []).slice(0, 5).map((a) => `${a.name} (${a.pos} ${a.nfl})`) },
  ];
  const activeInfo = infoBlocks[tickerIndex];

  return (
    <div className="fixed inset-0 bg-black text-white">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-8 py-4 text-2xl font-semibold bg-zinc-900/80 border-b border-zinc-800">
          <div>East v West Draft {draft?.year ?? new Date().getFullYear()}</div>
          {draft && (
            <div className="text-lg text-zinc-300">Overall #{draft.curOverall} • Status {draft.status}</div>
          )}
        </div>

        <div className="flex-1 grid grid-cols-5 gap-6 p-8">
          <div className="col-span-3 flex flex-col items-center justify-center">
            <div className="text-3xl text-zinc-300 mb-4">On The Clock</div>
            {onClockTeam ? (
              <div className="flex items-center gap-6">
                <TeamBadge team={onClockTeam} size="lg" />
                <div className="text-6xl font-extrabold tracking-tight">{onClockTeam}</div>
              </div>
            ) : (
              <div className="text-4xl">—</div>
            )}
          </div>
          <div className="col-span-2 flex flex-col items-center justify-center">
            <div className="text-3xl text-zinc-300 mb-3">Clock</div>
            <div className={`text-8xl font-mono ${remainingSec !== null && remainingSec <= 10 ? "text-red-400" : ""}`}>
              {clockDisplay}
            </div>
            <div className="text-zinc-500 mt-2">{draft?.status === "LIVE" ? "LIVE" : draft?.status}</div>
          </div>
        </div>

        <div className="px-8 pb-8 grid grid-cols-5 gap-6">
          <div className="col-span-3">
            <div className="h-24 relative overflow-hidden">
              {showPickBanner && lastPick && (
                <div ref={pickBannerRef} className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl rounded-lg bg-emerald-600 px-6 py-4 shadow-xl">
                  <div className="text-center text-2xl font-bold">Pick is in</div>
                  <div className="text-center mt-1 text-lg">
                    #{lastPick.overall} R{lastPick.round} {lastPick.team} — {lastPick.playerName || lastPick.playerId}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="col-span-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 h-24">
              <div className="text-zinc-400 text-sm">{activeInfo.title}</div>
              <div className="mt-2 flex gap-6 text-sm">
                {activeInfo.content.length === 0 ? (
                  <div className="text-zinc-500">—</div>
                ) : (
                  activeInfo.content.map((s, i) => (
                    <div key={i} className="truncate max-w-[12rem]">{s}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
