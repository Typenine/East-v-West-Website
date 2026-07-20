/**
 * Runtime completion layer for the legacy enhanced-context path.
 *
 * Older callers created an EnhancedContextData object with zeroed prediction
 * records and empty callback/disagreement arrays. This adapter fills those
 * fields from persistent bot memory before rendering the context. Current
 * injury/opportunity/breakout signals are supplied by live-external-data.ts.
 */

import {
  buildEnhancedContextString as buildBaseEnhancedContextString,
  type EnhancedContextData,
  type PreviousPrediction,
  type BotDisagreement,
} from './enhanced-context';
import type { BotMemory, HotTake } from './types';

function predictionRecord(memory: BotMemory | null) {
  const stats = memory?.predictionStats;
  const correct = stats?.correct ?? 0;
  const wrong = stats?.wrong ?? 0;
  return { correct, wrong, rate: correct + wrong > 0 ? correct / (correct + wrong) : 0 };
}

function pendingPredictions(memory: BotMemory | null): PreviousPrediction[] {
  if (!memory?.predictions?.length) return [];
  return memory.predictions
    .filter(prediction => prediction.result !== undefined)
    .slice(-6)
    .map(prediction => ({
      week: prediction.week,
      bot: memory.bot,
      prediction: `${prediction.pick} over ${prediction.pick === prediction.team1 ? prediction.team2 : prediction.team1}`,
      subject: `${prediction.team1} vs ${prediction.team2}`,
      result: prediction.result ?? 'pending',
      actualOutcome: prediction.actualWinner
        ? `${prediction.actualWinner} won${typeof prediction.margin === 'number' ? ` by ${prediction.margin.toFixed(1)}` : ''}`
        : undefined,
    }));
}

function unresolvedHotTakes(memories: Array<BotMemory | null>): HotTake[] {
  const seen = new Set<string>();
  const takes: HotTake[] = [];
  for (const memory of memories) {
    for (const take of memory?.hotTakes?.slice(-10) ?? []) {
      const key = `${take.week}:${take.subject}:${take.take}`;
      if (seen.has(key)) continue;
      seen.add(key);
      takes.push(take);
    }
  }
  return takes.slice(-8);
}

function memoryDisagreements(memories: Array<BotMemory | null>): { active: BotDisagreement[]; resolved: BotDisagreement[] } {
  const active: BotDisagreement[] = [];
  const resolved: BotDisagreement[] = [];
  for (const memory of memories) {
    if (!memory) continue;
    const feud = memory.partnerDynamics?.activeFeud;
    if (feud && !active.some(item => item.topic === feud.topic)) {
      active.push({
        week: feud.startedWeek,
        topic: feud.topic,
        entertainerPosition: memory.bot === 'entertainer' ? feud.myPosition : feud.theirPosition,
        analystPosition: memory.bot === 'analyst' ? feud.myPosition : feud.theirPosition,
        resolved: false,
      });
    }
    for (const interaction of memory.partnerDynamics?.recentInteractions?.slice(-8) ?? []) {
      if (!interaction.whoWasRight) continue;
      const winner = interaction.whoWasRight === 'both' || interaction.whoWasRight === 'neither'
        ? 'push'
        : interaction.whoWasRight === 'me'
          ? memory.bot
          : memory.bot === 'entertainer' ? 'analyst' : 'entertainer';
      const key = `${interaction.week}:${interaction.topic}`;
      if (resolved.some(item => `${item.week}:${item.topic}` === key)) continue;
      resolved.push({
        week: interaction.week,
        topic: interaction.topic,
        entertainerPosition: memory.bot === 'entertainer' ? interaction.myTake : interaction.theirTake,
        analystPosition: memory.bot === 'analyst' ? interaction.myTake : interaction.theirTake,
        resolved: true,
        winner,
        resolution: interaction.matchup ?? interaction.topic,
      });
    }
  }
  return { active: active.slice(-4), resolved: resolved.slice(-6) };
}

export function buildEnhancedContextString(data: EnhancedContextData): string {
  const memories = [data.entertainerMemory, data.analystMemory];
  const disagreements = memoryDisagreements(memories);
  const predictions = [
    ...pendingPredictions(data.entertainerMemory),
    ...pendingPredictions(data.analystMemory),
  ].slice(-12);

  const completed: EnhancedContextData = {
    ...data,
    activeDisagreements: data.activeDisagreements.length ? data.activeDisagreements : disagreements.active,
    recentResolutions: data.recentResolutions.length ? data.recentResolutions : disagreements.resolved,
    predictionRecords: {
      entertainer: data.predictionRecords.entertainer.correct + data.predictionRecords.entertainer.wrong > 0
        ? data.predictionRecords.entertainer
        : predictionRecord(data.entertainerMemory),
      analyst: data.predictionRecords.analyst.correct + data.predictionRecords.analyst.wrong > 0
        ? data.predictionRecords.analyst
        : predictionRecord(data.analystMemory),
    },
    predictionsToGrade: data.predictionsToGrade.length ? data.predictionsToGrade : predictions,
    hotTakesToRevisit: data.hotTakesToRevisit.length ? data.hotTakesToRevisit : unresolvedHotTakes(memories),
  };

  return buildBaseEnhancedContextString(completed);
}

export type { EnhancedContextData } from './enhanced-context';
