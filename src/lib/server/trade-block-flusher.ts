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
      batch.added.push(event.assetLabel);
    } else if (event.eventType === 'removed' && event.assetLabel) {
      batch.removed.push(event.assetLabel);
    } else if (event.eventType === 'wants_changed') {
      batch.wantsChanged = true;
      batch.newWants = event.newWants || undefined;
    }
  }
  
  return Array.from(teamMap.values());
}

function formatSchefterMessage(batch: TeamBatch): string {
  const siteUrl = process.env.SITE_URL || 'https://eastvswest.win';
  const parts: string[] = [];
  
  // Build narrative based on what changed
  if (batch.added.length > 0 && batch.removed.length === 0) {
    // Only additions
    if (batch.added.length === 1) {
      parts.push(`The ${batch.team} have added ${batch.added[0]} to their trade block, per sources.`);
    } else {
      const lastAsset = batch.added[batch.added.length - 1];
      const otherAssets = batch.added.slice(0, -1).join(', ');
      parts.push(`The ${batch.team} have added ${otherAssets} and ${lastAsset} to their trade block, per sources.`);
    }
  } else if (batch.removed.length > 0 && batch.added.length === 0) {
    // Only removals
    if (batch.removed.length === 1) {
      parts.push(`The ${batch.team} have removed ${batch.removed[0]} from their trade block, per sources.`);
    } else {
      const lastAsset = batch.removed[batch.removed.length - 1];
      const otherAssets = batch.removed.slice(0, -1).join(', ');
      parts.push(`The ${batch.team} have removed ${otherAssets} and ${lastAsset} from their trade block, per sources.`);
    }
  } else if (batch.added.length > 0 && batch.removed.length > 0) {
    // Both additions and removals
    const addedList = batch.added.length === 1 
      ? batch.added[0]
      : batch.added.slice(0, -1).join(', ') + ' and ' + batch.added[batch.added.length - 1];
    const removedList = batch.removed.length === 1
      ? batch.removed[0]
      : batch.removed.slice(0, -1).join(', ') + ' and ' + batch.removed[batch.removed.length - 1];
    
    parts.push(`The ${batch.team} have updated their trade block, adding ${addedList} while removing ${removedList}, per sources.`);
  }
  
  // Add wants as a follow-up sentence if changed
  if (batch.wantsChanged && batch.newWants) {
    parts.push(` Sources indicate the team is looking for: ${batch.newWants}.`);
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
    // Get events older than 120 seconds
    const events = await getPendingTradeBlockEvents(120);
    
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
