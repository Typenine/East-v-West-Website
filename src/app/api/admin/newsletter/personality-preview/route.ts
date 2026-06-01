/**
 * Personality Preview Tool — Phase 3
 *
 * POST /api/admin/newsletter/personality-preview
 *
 * Returns a compact summary of what the bot "knows" for a given section:
 * - bot brain (identity, voice)
 * - team card context
 * - event judgment
 * - selected stance + instructions
 * - narrative heat
 * - phase behavior rules
 * - dedupe context (if applicable)
 * - sample guardrail check on provided text
 *
 * This is a DIAGNOSTIC tool — no LLM calls, no generation, no secrets exposed.
 */

import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getBotBrain } from '@/lib/newsletter/bot-brain';
import { getTeamCard, computeRivalryScore, buildTeamCardContext } from '@/lib/newsletter/team-narratives';
import { judgeSection } from '@/lib/newsletter/judgment';
import { selectStance, getStanceInstructions } from '@/lib/newsletter/stance';
import { computeNarrativeHeat } from '@/lib/newsletter/narrative-heat';
import { getPhaseRules, buildPhaseRulesContext } from '@/lib/newsletter/episodes';
import { checkOutput } from '@/lib/newsletter/guardrails';
import type { BotName } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try {
    return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const bot: BotName = (body.bot === 'analyst') ? 'analyst' : 'entertainer';
  const sectionType  = typeof body.sectionType  === 'string' ? body.sectionType  : 'Recap_0';
  const episodeType  = typeof body.episodeType  === 'string' ? body.episodeType  : 'regular';
  const week         = typeof body.week         === 'number' ? body.week         : 8;
  const season       = typeof body.season       === 'number' ? body.season       : new Date().getFullYear();
  const teamNames    = Array.isArray(body.teamNames)
    ? (body.teamNames as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 2)
    : [];
  const matchupMargin = typeof body.matchupMargin === 'number' ? body.matchupMargin : undefined;
  const sampleText   = typeof body.sampleText   === 'string' ? body.sampleText   : '';

  // 1. Bot Brain summary (safe subset — no API keys or secrets)
  const brain = getBotBrain(bot);
  const botBrainSummary = {
    key: brain.key,
    displayName: brain.displayName,
    role: brain.role,
    voice: brain.voice,
    debate: brain.debate,
    blindSpots: brain.blindSpots,
    safetyBoundaries: brain.safetyBoundaries,
  };

  // 2. Team card contexts
  const teamCardContexts: Record<string, unknown> = {};
  for (const teamName of teamNames) {
    const card = getTeamCard(teamName);
    teamCardContexts[teamName] = card
      ? {
          archetype: card.archetype,
          era: card.era,
          currentSeasonArc: card.currentSeasonArc || null,
          runningJokes: card.runningJokes.slice(0, 3),
          retiredJokes: card.retiredJokes.slice(0, 3),
          sensitivityLevel: card.sensitivityLevel,
          dataConfidence: card.dataConfidence,
          promptContext: buildTeamCardContext(teamName),
        }
      : null;
  }

  // 3. Rivalry score (if two teams provided)
  const rivalryScore = teamNames.length === 2
    ? computeRivalryScore(teamNames[0], teamNames[1])
    : 0;

  // 4. Event Judgment
  const isBlowout   = matchupMargin !== undefined && matchupMargin >= 30;
  const isNailbiter = matchupMargin !== undefined && matchupMargin <= 5;
  const judgment = judgeSection({
    sectionType,
    episodeType,
    week,
    season,
    teamNames,
    matchupMargin,
    isBlowout,
    isNailbiter,
    rivalryScore,
    isPlayoffs: episodeType === 'playoffs_round' || episodeType === 'championship',
    isChampionship: episodeType === 'championship',
    isTradeDeadline: episodeType === 'trade_deadline',
  });

  // 5. Stance selection
  const stance = selectStance({
    sectionType,
    episodeType,
    bot,
    judgment,
    week,
  });
  const stanceInstructions = getStanceInstructions(stance, bot);

  // 6. Narrative heat (standalone, for display)
  const heat = computeNarrativeHeat({
    matchupMargin,
    isPlayoffs: episodeType === 'playoffs_round' || episodeType === 'championship',
    isChampionship: episodeType === 'championship',
    rivalryScore,
  });

  // 7. Phase rules
  const phaseRules = getPhaseRules(episodeType);
  const phaseRulesContext = buildPhaseRulesContext(phaseRules);

  // 8. Guardrail check on sample text (if provided)
  let guardrailResult: unknown = null;
  if (sampleText.trim().length > 10) {
    const { text: _text, warnings, blocked } = checkOutput(sampleText, { sectionType });
    guardrailResult = {
      blocked,
      warningCount: warnings.length,
      warnings: warnings.map(w => ({
        rule: w.rule,
        severity: w.severity,
        snippet: w.snippet.slice(0, 80),
        suggestion: w.suggestion,
      })),
    };
  }

  return Response.json({
    bot,
    sectionType,
    episodeType,
    week,
    season,
    teamNames,
    rivalryScore,
    botBrain: botBrainSummary,
    teamCards: teamCardContexts,
    judgment: {
      eventType: judgment.eventType,
      stakes: judgment.stakes,
      comedyValue: judgment.comedyValue,
      sensitivity: judgment.sensitivity,
      recommendedStance: judgment.recommendedStance,
      shouldLeanIn: judgment.shouldLeanIn,
      note: judgment.note,
      rivalryScore: judgment.rivalryScore,
      avoidList: judgment.avoidList,
    },
    narrativeHeat: {
      score: heat.score,
      tier: heat.tier,
      factors: heat.factors,
      shouldLeanIn: heat.shouldLeanIn,
    },
    stance,
    stanceInstructions,
    phaseRules: {
      name: phaseRules.name,
      priorities: phaseRules.priorities,
      avoidances: phaseRules.avoidances,
      preferredStances: phaseRules.preferredStances,
      comedyCeiling: phaseRules.comedyCeiling,
      historicalDepth: phaseRules.historicalDepth,
      context: phaseRulesContext,
    },
    guardrailResult,
  });
}
