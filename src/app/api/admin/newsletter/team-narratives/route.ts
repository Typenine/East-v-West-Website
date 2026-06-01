/**
 * Admin Team Narrative Cards API
 * GET    /api/admin/newsletter/team-narratives             — list all cards (hardcoded + overrides)
 * GET    /api/admin/newsletter/team-narratives?team=Name   — single card
 * POST   /api/admin/newsletter/team-narratives             { teamName, cardData }
 * DELETE /api/admin/newsletter/team-narratives?team=Name   — remove override (revert to default)
 */

import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  loadTeamNarrativeCard,
  loadAllTeamNarrativeOverrides,
  saveTeamNarrativeCard,
  deleteTeamNarrativeCard,
} from '@/server/db/personality-queries';
import { getAllTeamCards, getTeamCard } from '@/lib/newsletter/team-narratives';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try {
    return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const teamParam = new URL(req.url).searchParams.get('team');

  if (teamParam) {
    // Single team
    const hardcoded = getTeamCard(teamParam);
    const dbOverride = await loadTeamNarrativeCard(teamParam);
    return Response.json({
      teamName: teamParam,
      hardcoded: hardcoded ?? null,
      dbOverride: dbOverride?.cardData ?? null,
      effective: hardcoded ?? null, // getTeamCard already merges; this is the merged result
    });
  }

  // All teams
  const hardcoded = getAllTeamCards();
  const dbOverrides = await loadAllTeamNarrativeOverrides();
  const overrideMap = new Map(dbOverrides.map(r => [r.teamName, r.cardData]));

  const teams = hardcoded.map(card => ({
    teamName: card.teamName,
    archetype: card.archetype,
    era: card.era,
    currentSeasonArc: card.currentSeasonArc || null,
    dataConfidence: card.dataConfidence,
    hasDbOverride: overrideMap.has(card.teamName),
    dbOverride: overrideMap.get(card.teamName) ?? null,
  }));

  // Also include any DB-only teams (added via admin, no hardcoded card)
  for (const r of dbOverrides) {
    if (!hardcoded.find(c => c.teamName === r.teamName)) {
      teams.push({
        teamName: r.teamName,
        archetype: (r.cardData as { archetype?: string })?.archetype ?? 'Unknown',
        era: (r.cardData as { era?: string })?.era as 'unknown' ?? 'unknown',
        currentSeasonArc: (r.cardData as { currentSeasonArc?: string })?.currentSeasonArc ?? null,
        dataConfidence: 'low' as const,
        hasDbOverride: true,
        dbOverride: r.cardData,
      });
    }
  }

  return Response.json({ teams, knownTeamNames: TEAM_NAMES });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : '';
  if (!teamName) return Response.json({ error: 'teamName required' }, { status: 400 });

  const rawCard = body.cardData;
  if (!rawCard || typeof rawCard !== 'object') {
    return Response.json({ error: 'cardData object required' }, { status: 400 });
  }

  const card = rawCard as Record<string, unknown>;

  // Build safe cardData — only accept known fields
  const cardData: Parameters<typeof saveTeamNarrativeCard>[1] = {};

  if (typeof card.archetype === 'string')      cardData.archetype      = card.archetype.trim().slice(0, 200);
  if (card.era && ['early','peak','decline','rebuild','unknown'].includes(card.era as string)) {
    cardData.era = card.era as typeof cardData.era;
  }
  if (typeof card.historicalArc === 'string')    cardData.historicalArc    = card.historicalArc.trim().slice(0, 500);
  if (typeof card.currentSeasonArc === 'string') cardData.currentSeasonArc = card.currentSeasonArc.trim().slice(0, 300);
  if (card.botRelationship && typeof card.botRelationship === 'object') {
    const br = card.botRelationship as Record<string, unknown>;
    if (typeof br.entertainerView === 'string' && typeof br.analystView === 'string') {
      cardData.botRelationship = {
        entertainerView: br.entertainerView.trim().slice(0, 300),
        analystView: br.analystView.trim().slice(0, 300),
      };
    }
  }
  if (Array.isArray(card.runningJokes)) {
    cardData.runningJokes = (card.runningJokes as unknown[])
      .filter((j): j is string => typeof j === 'string' && j.trim().length > 0)
      .map(j => j.trim())
      .slice(0, 10);
  }
  if (Array.isArray(card.retiredJokes)) {
    cardData.retiredJokes = (card.retiredJokes as unknown[])
      .filter((j): j is string => typeof j === 'string')
      .map(j => j.trim())
      .slice(0, 20);
  }
  if (Array.isArray(card.preferredAngles)) {
    cardData.preferredAngles = (card.preferredAngles as unknown[])
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      .map(a => a.trim())
      .slice(0, 10);
  }
  if (card.sensitivityLevel && ['low','medium','high'].includes(card.sensitivityLevel as string)) {
    cardData.sensitivityLevel = card.sensitivityLevel as typeof cardData.sensitivityLevel;
  }
  if (Array.isArray(card.achievements)) {
    cardData.achievements = (card.achievements as unknown[])
      .filter((a): a is string => typeof a === 'string')
      .map(a => a.trim())
      .slice(0, 20);
  }
  if (Array.isArray(card.wounds)) {
    cardData.wounds = (card.wounds as unknown[])
      .filter((w): w is string => typeof w === 'string')
      .map(w => w.trim())
      .slice(0, 20);
  }

  try {
    await saveTeamNarrativeCard(teamName, cardData);
    return Response.json({ ok: true, teamName });
  } catch (err) {
    console.error('[admin/team-narratives] save failed:', err);
    return Response.json({ error: 'save failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const team = new URL(req.url).searchParams.get('team');
  if (!team) return Response.json({ error: 'team param required' }, { status: 400 });

  try {
    await deleteTeamNarrativeCard(team);
    return Response.json({ ok: true, team, message: 'Override removed — hardcoded defaults restored' });
  } catch (err) {
    console.error('[admin/team-narratives] delete failed:', err);
    return Response.json({ error: 'delete failed' }, { status: 500 });
  }
}
