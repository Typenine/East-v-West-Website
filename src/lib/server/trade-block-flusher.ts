import { getPendingTradeBlockEvents, markTradeBlockEventsSent } from '@/server/db/queries.fixed';

type TradeBlockEvent = {
  id: string;
  team: string;
  eventType: string;
  assetType: string | null;
  assetId: string | null;
  assetLabel: string | null;
  oldWants: string | null;
  newWants: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

type TeamBatch = {
  team: string;
  added: string[];
  removed: string[];
  wantsChanged: boolean;
  newWants?: string;
  eventIds: string[];
};

function groupEventsByTeam(events: TradeBlockEvent[]): TeamBatch[] {
  const teamMap = new Map<string, TeamBatch>();
  
  for (const event of events) {
    if (!teamMap.has(event.team)) {
      teamMap.set(event.team, {
        team: event.team,
        added: [],
        removed: [],
        wantsChanged: false,
        eventIds: [],
      });
    }
    
    const batch = teamMap.get(event.team)!;
    batch.eventIds.push(event.id);
    
    if (event.eventType === 'added' && event.assetLabel) {
      // Deduplicate - only add if not already in the list
      if (!batch.added.includes(event.assetLabel)) {
        batch.added.push(event.assetLabel);
      }
    } else if (event.eventType === 'removed' && event.assetLabel) {
      // Deduplicate - only add if not already in the list
      if (!batch.removed.includes(event.assetLabel)) {
        batch.removed.push(event.assetLabel);
      }
    } else if (event.eventType === 'wants_changed') {
      batch.wantsChanged = true;
      batch.newWants = event.newWants || undefined;
    }
  }
  
  return Array.from(teamMap.values());
}

function formatSchefterMessage(batch: TeamBatch): string {
  const siteUrl = (process.env.SITE_URL || 'https://eastvswest.win').replace(/\/$/, '');
  const parts: string[] = [];
  
  // Vary the narrative structure for more natural feel
  const variants = {
    addSingle: [
      `The ${batch.team} are making ${batch.added[0]} available in trade discussions, per sources.`,
      `${batch.added[0]} is now on the trade block for the ${batch.team}, league sources say.`,
      `The ${batch.team} have placed ${batch.added[0]} on their trade block, per sources.`,
    ],
    addMultiple: [
      `The ${batch.team} are shopping multiple assets, including {list}, per sources.`,
      `League sources say the ${batch.team} have made {list} available via trade.`,
      `The ${batch.team} are listening to offers on {list}, per sources.`,
    ],
    removeSingle: [
      `The ${batch.team} have pulled ${batch.removed[0]} off the trade block, per sources.`,
      `${batch.removed[0]} is no longer available for the ${batch.team}, league sources say.`,
      `The ${batch.team} are no longer shopping ${batch.removed[0]}, per sources.`,
    ],
    removeMultiple: [
      `The ${batch.team} have removed {list} from trade discussions, per sources.`,
      `League sources say {list} are no longer available from the ${batch.team}.`,
      `The ${batch.team} are pulling back on trade talks involving {list}, per sources.`,
    ],
    mixed: [
      `The ${batch.team} are shaking up their trade approach: adding {added} to the block while pulling {removed} off, per sources.`,
      `In a shift in strategy, the ${batch.team} have made {added} available while removing {removed} from consideration, league sources say.`,
      `The ${batch.team} are recalibrating their trade plans, now shopping {added} but no longer listening on {removed}, per sources.`,
    ],
  };
  
  // Pick a random variant for variety
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  
  if (batch.added.length > 0 && batch.removed.length === 0) {
    // Only additions
    if (batch.added.length === 1) {
      parts.push(pick(variants.addSingle));
    } else {
      const lastAsset = batch.added[batch.added.length - 1];
      const otherAssets = batch.added.slice(0, -1).join(', ');
      const list = `${otherAssets} and ${lastAsset}`;
      parts.push(pick(variants.addMultiple).replace('{list}', list));
    }
  } else if (batch.removed.length > 0 && batch.added.length === 0) {
    // Only removals
    if (batch.removed.length === 1) {
      parts.push(pick(variants.removeSingle));
    } else {
      const lastAsset = batch.removed[batch.removed.length - 1];
      const otherAssets = batch.removed.slice(0, -1).join(', ');
      const list = `${otherAssets} and ${lastAsset}`;
      parts.push(pick(variants.removeMultiple).replace('{list}', list));
    }
  } else if (batch.added.length > 0 && batch.removed.length > 0) {
    // Both additions and removals
    const addedList = batch.added.length === 1 
      ? batch.added[0]
      : batch.added.slice(0, -1).join(', ') + ' and ' + batch.added[batch.added.length - 1];
    const removedList = batch.removed.length === 1
      ? batch.removed[0]
      : batch.removed.slice(0, -1).join(', ') + ' and ' + batch.removed[batch.removed.length - 1];
    
    parts.push(pick(variants.mixed).replace('{added}', addedList).replace('{removed}', removedList));
  }
  
  // Add wants as a follow-up sentence if changed - vary this too
  if (batch.wantsChanged && batch.newWants) {
    const wantsVariants = [
      ` The team is believed to be targeting: ${batch.newWants}.`,
      ` Sources say the ${batch.team} are looking for: ${batch.newWants}.`,
      ` According to league sources, the team's focus is on acquiring: ${batch.newWants}.`,
    ];
    parts.push(pick(wantsVariants));
  }
  
  // Link
  parts.push(`\n\n${siteUrl}/trades`);
  
  return parts.join('');
}

async function postToDiscord(message: string): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_TRADE_BLOCK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('DISCORD_TRADE_BLOCK_WEBHOOK_URL not configured');
    return false;
  }
  
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Discord webhook failed:', res.status, text);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Failed to post to Discord:', e);
    return false;
  }
}

export async function flushTradeBlockEvents(): Promise<{ processed: number; sent: number }> {
  try {
    // Get events older than 40 seconds
    const events = await getPendingTradeBlockEvents(40);
    console.log(`[trade-block-flusher] Found ${events.length} pending events`);
    
    if (events.length === 0) {
      return { processed: 0, sent: 0 };
    }
    
    // Group by team
    const batches = groupEventsByTeam(events as TradeBlockEvent[]);
    
    let sentCount = 0;
    const sentEventIds: string[] = [];
    
    // Post each team's batch
    for (const batch of batches) {
      // Skip if no actual changes
      if (batch.added.length === 0 && batch.removed.length === 0 && !batch.wantsChanged) {
        // Still mark as sent to avoid reprocessing
        sentEventIds.push(...batch.eventIds);
        continue;
      }
      
      const message = formatSchefterMessage(batch);
      const success = await postToDiscord(message);
      
      if (success) {
        sentCount++;
        sentEventIds.push(...batch.eventIds);
      } else {
        console.error(`Failed to post trade block update for ${batch.team}`);
      }
    }
    
    // Mark events as sent
    if (sentEventIds.length > 0) {
      await markTradeBlockEventsSent(sentEventIds);
    }
    
    return { processed: events.length, sent: sentCount };
  } catch (e) {
    console.error('Failed to flush trade block events:', e);
    return { processed: 0, sent: 0 };
  }
}
