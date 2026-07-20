'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  NFLState,
  NewsletterData,
  NewsletterFrameHandle,
  NewsletterMeta,
  OutlineItem,
} from './types';
import {
  displayIssueTitle,
  fileSafeTitle,
  releaseDateKey,
  resolveNewsletterType,
  sortByPublished,
} from './utils';

export function useNewsletterArchive() {
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [currentSeason, setCurrentSeason] = useState('2026');
  const [seasonType, setSeasonType] = useState('off');
  const [issues, setIssues] = useState<NewsletterMeta[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [issueData, setIssueData] = useState<Record<string, NewsletterData>>({});
  const [issueErrors, setIssueErrors] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [outlines, setOutlines] = useState<Record<string, OutlineItem[]>>({});
  const [pdfIssueId, setPdfIssueId] = useState<string | null>(null);
  const requestedIdsRef = useRef<Set<string>>(new Set());
  const frameRefs = useRef<Record<string, NewsletterFrameHandle | null>>({});

  const releaseGroups = useMemo(() => {
    const groups = new Map<string, NewsletterMeta[]>();
    for (const issue of issues) {
      const key = releaseDateKey(issue);
      groups.set(key, [...(groups.get(key) ?? []), issue]);
    }
    return Array.from(groups.entries()).map(([key, items]) => ({ key, items }));
  }, [issues]);

  const loadIssue = useCallback(async (id: string) => {
    if (requestedIdsRef.current.has(id)) return;
    requestedIdsRef.current.add(id);
    setLoadingIds(current => new Set(current).add(id));
    setIssueErrors(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    try {
      const response = await fetch(`/api/newsletter?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await response.json() as NewsletterData & { success?: boolean; error?: string };
      if (!response.ok || data.success === false) throw new Error(data.error || 'Failed to load newsletter');
      setIssueData(current => ({ ...current, [id]: data }));
    } catch (error) {
      setIssueErrors(current => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'Failed to load newsletter',
      }));
    } finally {
      requestedIdsRef.current.delete(id);
      setLoadingIds(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setLoading(true);
      setCatalogError(null);
      try {
        const params = new URLSearchParams(window.location.search);
        const seasonParam = params.get('season');
        const linkedSeason = seasonParam && Number.isFinite(Number(seasonParam)) ? seasonParam : null;
        const stateRes = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' });
        const state = stateRes.ok
          ? await stateRes.json() as NFLState
          : { season: '2026', week: 0, season_type: 'off' };
        const season = linkedSeason || state.season || '2026';
        const listRes = await fetch(`/api/newsletter?list=true&season=${season}`, { cache: 'no-store' });
        const listData = await listRes.json() as { items?: NewsletterMeta[]; error?: string };
        if (!listRes.ok) throw new Error(listData.error || 'Failed to load newsletter archive');

        const published = (listData.items ?? [])
          .filter(item => item.status === 'published')
          .sort(sortByPublished);
        const requestedId = params.get('issue') || params.get('id');
        const requestedTitle = params.get('title')?.trim().toLowerCase() || null;
        const weekParam = params.get('week');
        const requestedSeason = seasonParam ? Number(seasonParam) : null;
        const requestedWeek = weekParam ? Number(weekParam) : null;
        const requestedType = params.get('type');
        const linkedIssue = published.find(item => {
          if (requestedId) return item.id === requestedId;
          if (requestedSeason !== null && Number.isFinite(requestedSeason) && item.season !== requestedSeason) return false;
          if (requestedWeek !== null && Number.isFinite(requestedWeek) && item.week !== requestedWeek) return false;
          if (requestedType && resolveNewsletterType(item) !== requestedType) return false;
          if (requestedTitle && item.title?.trim().toLowerCase() !== requestedTitle) return false;
          return Boolean(requestedTitle || requestedType || (requestedWeek !== null && Number.isFinite(requestedWeek)));
        });
        const initialId = linkedIssue?.id ?? null;
        const hasDirectSelector = Boolean(requestedId || requestedTitle || requestedType || (requestedWeek !== null && Number.isFinite(requestedWeek)));

        if (!cancelled) {
          setCurrentSeason(season);
          setSeasonType(state.season_type || 'off');
          setIssues(published);
          setOpenIds(initialId ? new Set([initialId]) : new Set());
          if (initialId && hasDirectSelector) {
            window.setTimeout(() => {
              document.getElementById(`newsletter-${initialId}`)?.scrollIntoView({ block: 'start' });
            }, 100);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setIssues([]);
          setOpenIds(new Set());
          setCatalogError(error instanceof Error ? error.message : 'Failed to load newsletter archive');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCatalog();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    openIds.forEach(id => {
      if (!issueData[id] && !issueErrors[id] && !loadingIds.has(id)) void loadIssue(id);
    });
  }, [issueData, issueErrors, loadIssue, loadingIds, openIds]);

  const setIssueInUrl = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    url.searchParams.delete('season');
    url.searchParams.delete('week');
    url.searchParams.delete('type');
    url.searchParams.delete('title');
    if (id) {
      url.searchParams.set('issue', id);
      url.searchParams.set('season', currentSeason);
    } else {
      url.searchParams.delete('issue');
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [currentSeason]);

  const toggleIssue = useCallback((id: string) => {
    setOpenIds(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setIssueInUrl(next.values().next().value ?? null);
      } else {
        next.add(id);
        setIssueInUrl(id);
      }
      return next;
    });
  }, [setIssueInUrl]);

  const openLatest = useCallback(() => {
    const latestId = issues[0]?.id;
    if (!latestId) return;
    setOpenIds(current => new Set(current).add(latestId));
    setIssueInUrl(latestId);
    window.setTimeout(() => {
      document.getElementById(`newsletter-${latestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [issues, setIssueInUrl]);

  const downloadPdf = useCallback(async (issue: NewsletterMeta) => {
    const frame = frameRefs.current[issue.id];
    if (!frame) return;
    setPdfIssueId(issue.id);
    setIssueErrors(current => {
      const next = { ...current };
      delete next[issue.id];
      return next;
    });
    try {
      const title = displayIssueTitle(issue);
      await frame.downloadPdf(`${fileSafeTitle(title)}.pdf`, title);
    } catch (error) {
      setIssueErrors(current => ({
        ...current,
        [issue.id]: error instanceof Error ? error.message : 'PDF download failed',
      }));
    } finally {
      setPdfIssueId(null);
    }
  }, []);

  const setOutline = useCallback((id: string, items: OutlineItem[]) => {
    setOutlines(current => ({ ...current, [id]: items }));
  }, []);

  const setFrame = useCallback((id: string, handle: NewsletterFrameHandle | null) => {
    frameRefs.current[id] = handle;
  }, []);

  return {
    loading,
    catalogError,
    currentSeason,
    isOffseason: seasonType !== 'regular' && seasonType !== 'post',
    issues,
    openIds,
    issueData,
    issueErrors,
    loadingIds,
    outlines,
    pdfIssueId,
    releaseGroups,
    loadIssue,
    toggleIssue,
    openLatest,
    downloadPdf,
    setOutline,
    setFrame,
  };
}
