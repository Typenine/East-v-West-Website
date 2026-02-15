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
  
  // Authentic Schefter-style variations - breaking news tone with source attribution
  const variants = {
    addSingle: [
      `Breaking: The ${batch.team} are making ${batch.added[0]} available via trade, per league sources.`,
      `${batch.added[0]} is now on the trade block, per sources informed of the ${batch.team}'s plans.`,
      `Sources: The ${batch.team} are willing to listen to offers on ${batch.added[0]}.`,
      `The ${batch.team} have made ${batch.added[0]} available in trade talks, league sources tell ESPN.`,
    ],
    addMultiple: [
      `Breaking: The ${batch.team} are making {list} available via trade, per league sources.`,
      `The ${batch.team} are shopping {list}, sources tell ESPN.`,
      `League sources say the ${batch.team} are open to dealing {list}.`,
      `Sources: The ${batch.team} have put {list} on the trade block.`,
    ],
    removeSingle: [
      `The ${batch.team} have pulled ${batch.removed[0]} off the trade block, per sources.`,
      `${batch.removed[0]} is no longer available, sources tell ESPN.`,
      `The ${batch.team} are taking ${batch.removed[0]} off the market, per league sources.`,
      `Sources: The ${batch.team} have decided to keep ${batch.removed[0]}.`,
    ],
    removeMultiple: [
      `The ${batch.team} have removed {list} from the trade block, per sources.`,
      `{list} are no longer available, league sources say.`,
      `Sources: The ${batch.team} are pulling {list} off the market.`,
      `The ${batch.team} have decided to keep {list}, per sources informed of the decision.`,
    ],
    mixed: [
      `Trade-block update: The ${batch.team} are adding {added} while removing {removed}, per sources.`,
      `The ${batch.team} are making {added} available but pulling {removed} off the block, league sources say.`,
      `Sources: The ${batch.team} have updated their trade plans, now shopping {added} but keeping {removed}.`,
      `The ${batch.team} are shifting their approach, adding {added} to the block while taking {removed} off, per league sources.`,
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
