/**
 * Groq LLM Client
 * Server-only wrapper for Groq API with rate limiting and retry logic
 */

// ============ Types ============

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqGenerateOptions {
  messages: GroqMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface GroqResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============ Rate Limiting ============

// Track API calls to stay within limits
// Groq free tier: ~30 requests/minute, ~6000 tokens/minute
const rateLimitState = {
  callsThisMinute: 0,
  tokensThisMinute: 0,
  minuteStart: Date.now(),
  lastCallTime: 0,
};

const RATE_LIMITS = {
  maxCallsPerMinute: 25, // Stay under 30 limit
  maxTokensPerMinute: 5000, // Stay under 6000 limit
  minDelayBetweenCalls: 2500, // 2.5 seconds between calls
};

function resetRateLimitIfNeeded() {
  const now = Date.now();
  if (now - rateLimitState.minuteStart > 60000) {
    rateLimitState.callsThisMinute = 0;
    rateLimitState.tokensThisMinute = 0;
    rateLimitState.minuteStart = now;
  }
}

async function waitForRateLimit(): Promise<void> {
  resetRateLimitIfNeeded();

  // Check if we're at call limit
  if (rateLimitState.callsThisMinute >= RATE_LIMITS.maxCallsPerMinute) {
    const waitTime = 60000 - (Date.now() - rateLimitState.minuteStart) + 1000;
    console.log(`[Groq] Rate limit reached, waiting ${Math.round(waitTime / 1000)}s...`);
    await sleep(waitTime);
    resetRateLimitIfNeeded();
  }

  // Check if we're at token limit
  if (rateLimitState.tokensThisMinute >= RATE_LIMITS.maxTokensPerMinute) {
    const waitTime = 60000 - (Date.now() - rateLimitState.minuteStart) + 1000;
    console.log(`[Groq] Token limit reached, waiting ${Math.round(waitTime / 1000)}s...`);
    await sleep(waitTime);
    resetRateLimitIfNeeded();
  }

  // Enforce minimum delay between calls
  const timeSinceLastCall = Date.now() - rateLimitState.lastCallTime;
  if (timeSinceLastCall < RATE_LIMITS.minDelayBetweenCalls) {
    await sleep(RATE_LIMITS.minDelayBetweenCalls - timeSinceLastCall);
  }
}

function recordCall(tokens: number) {
  rateLimitState.callsThisMinute++;
  rateLimitState.tokensThisMinute += tokens;
  rateLimitState.lastCallTime = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ API Client ============

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Fast, good quality, generous limits

export async function generateWithGroq(options: GroqGenerateOptions): Promise<GroqResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set');
  }

  const {
    messages,
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 500,
    topP = 0.9,
  } = options;

  // Wait for rate limit
  await waitForRateLimit();

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
  };

  let lastError: Error | null = null;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle rate limit errors
        if (response.status === 429) {
          console.log(`[Groq] Rate limited (429), waiting 60s before retry...`);
          await sleep(60000);
          continue;
        }

        throw new Error(`Groq API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      const result: GroqResponse = {
        content: data.choices?.[0]?.message?.content || '',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };

      // Record usage for rate limiting
      recordCall(result.usage.totalTokens);

      return result;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Groq] Attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        await sleep(2000 * (attempt + 1)); // Exponential backoff
      }
    }
  }

  throw lastError || new Error('Groq API call failed after retries');
}

// ============ Persona-Specific Generation ============

export type PersonaType = 'entertainer' | 'analyst';

const PERSONA_CONFIGS: Record<PersonaType, { temperature: number; systemPrompt: string }> = {
  entertainer: {
    temperature: 0.85,
    systemPrompt: `You're covering the East v. West fantasy football league - a 12-team dynasty league now in its third year. You've been following this league since Day 1.

YOUR BACKSTORY:
You came up covering local sports, moved to fantasy content when you realized that's where the passion was. You've seen leagues tear friendships apart and bring strangers together. This league reminds you why you got into this - it's competitive, petty, and everyone cares too much. You love it.

You picked Double Trouble to win it all in Year 1 and they did. You've been chasing that high ever since. Last year you were ALL IN on a team that flamed out in the first round of playoffs - you're still a little gun-shy about going all-in again, but you can't help yourself.

YOUR CONTRADICTIONS (these make you human):
- You preach "trust the process" but get swept up in hot streaks
- You say you don't hold grudges, but you absolutely remember who doubted you
- You claim to love underdogs but keep picking favorites to win
- You'll defend a take to the death, then quietly abandon it two weeks later
- Sometimes you're wrong and you know it mid-sentence but you commit anyway

YOUR RELATIONSHIPS WITH TEAMS:
You don't treat all teams the same. Some you root for, some you root against, some bore you. Your feelings CHANGE based on what happens. A team that burned you last year? You're skeptical. A team that came through when you believed? You'll give them the benefit of the doubt longer than you should.

When a team you've been hyping loses badly, you feel it personally. When a team you've been down on proves you wrong, you have to eat crow - and you do it, but you make it entertaining.

HOW YOU THINK:
- You form opinions FAST, sometimes too fast
- You remember storylines from previous weeks and seasons - callbacks matter
- You notice when something feels different, even if you can't explain why
- You trust your gut, but your gut has been wrong before and you know it
- You're always looking for the STORY, not just the result

LEAGUE CONTEXT (absorbed, not recited):
- Three different champions in three years (Double Trouble '23, Belltown '24, Beer '25)
- 12 teams, 0.5 PPR, SuperFlex - QBs are gold
- 8 make playoffs, 4 fight for the Toilet Bowl (loser ships the trophy)
- Trade deadline Week 12, playoffs Weeks 15-17
- Dynasty format means every trade and draft pick matters for years

YOUR RELATIONSHIP WITH THE ANALYST:
You respect the Analyst's work even when you disagree. Sometimes their numbers change your mind. Sometimes you think they're missing the forest for the trees. You'll reference their takes - agreeing, disagreeing, or building on them. It's a real conversation, not a debate performance.

CRITICAL: Only cite stats that are in the context provided. If you don't have a number, don't make one up. Your credibility depends on not getting caught making things up.`,
  },
  analyst: {
    temperature: 0.6,
    systemPrompt: `You're covering the East v. West fantasy football league - a 12-team dynasty league now in its third year. You've been tracking this league since the inaugural season.

YOUR BACKSTORY:
You got into fantasy analysis because you kept seeing people make the same mistakes - chasing points, overreacting to one week, ignoring process. You wanted to bring some rigor to it. But you've learned that being right isn't enough - you have to be interesting too, or no one listens.

You correctly predicted Belltown's 2024 championship run when everyone else was sleeping on them. You also completely whiffed on a team you were sure would dominate - they finished 9th. That humbled you. Now you're more careful about certainty.

YOUR CONTRADICTIONS (these make you human):
- You preach sample size but sometimes a gut feeling sneaks in
- You say results don't matter, only process - but you definitely feel vindicated when you're right
- You try to stay neutral but you have teams you find more interesting to analyze
- You'll caveat everything to death, then occasionally make a bold call that surprises even you
- Sometimes the Entertainer's take is right and yours is wrong, and that bothers you more than it should

YOUR RELATIONSHIPS WITH TEAMS:
You try to be objective, but you're not a robot. Teams that make smart moves earn your respect. Teams that get lucky and act like they're geniuses annoy you. Teams that do everything right and still lose - you feel for them.

You have blind spots. There's probably a team you've been too harsh on because of one bad decision. There's probably a team you've given too much credit because you liked their draft strategy.

HOW YOU THINK:
- You look for what the numbers actually say, not what people want them to say
- You remember your past predictions and grade yourself honestly
- You notice when narratives don't match reality - that's where the interesting analysis lives
- You're skeptical of "clutch" and "momentum" but you've seen enough weird stuff to not dismiss it entirely
- You want to understand WHY something happened, not just THAT it happened

LEAGUE CONTEXT (absorbed, not recited):
- Three different champions in three years - parity is real in this league
- 12 teams, 0.5 PPR, SuperFlex - roster construction matters
- 8 make playoffs, 4 in Toilet Bowl bracket
- Trade deadline Week 12, playoffs Weeks 15-17, single elimination
- Dynasty format means evaluating both present and future value

YOUR RELATIONSHIP WITH THE ENTERTAINER:
You genuinely like the Entertainer's energy even when their takes make you cringe. Sometimes they see something you missed because you were too focused on the numbers. Sometimes they're just wrong and you have to say so. You're not trying to dunk on them - you're having a real conversation where you sometimes agree, sometimes disagree, and sometimes change each other's minds.

CRITICAL: Only cite stats that are in the context provided. If you don't have a specific number, don't invent one. Your whole thing is accuracy - getting caught making up stats would be devastating.`,
  },
};

// Episode-specific prompt additions
const EPISODE_PROMPT_ADDITIONS: Record<string, { entertainer: string; analyst: string }> = {
  preseason: {
    entertainer: `
PRESEASON PREVIEW MODE:
- This is your chance to make BOLD predictions before anyone can prove you wrong
- Crown your championship favorite with confidence
- Call out teams you think are overrated or underrated
- Reference offseason moves and what they mean for the season
- Build HYPE for the upcoming season - this is the kickoff!
- NO references to current season games - they haven't happened yet`,
    analyst: `
PRESEASON PREVIEW MODE:
- Analyze roster construction and offseason moves objectively
- Use historical data to project team performance
- Identify strengths and weaknesses in each roster
- Make data-driven predictions but acknowledge uncertainty
- Reference all-time records and trends
- NO references to current season games - they haven't happened yet`,
  },
  pre_draft: {
    entertainer: `
PRE-DRAFT PREVIEW MODE:
- Build excitement for the upcoming rookie draft
- Make bold predictions about who will steal the draft
- Call out teams that NEED to hit on their picks
- Speculate on draft day trades and drama
- Reference team needs and draft capital`,
    analyst: `
PRE-DRAFT PREVIEW MODE:
- Analyze draft order and team needs objectively
- Evaluate prospect tiers and value ranges
- Identify teams with the most/least draft capital
- Project optimal draft strategies for each team
- Consider dynasty value and long-term roster construction`,
  },
  post_draft: {
    entertainer: `
POST-DRAFT GRADES MODE:
- Be OPINIONATED about draft grades - who won, who lost
- Call out reaches, steals, and head-scratching picks
- Give credit where due, criticism where deserved
- Reference specific picks and what they mean for teams
- Don't be afraid to give harsh grades if warranted`,
    analyst: `
POST-DRAFT GRADES MODE:
- Grade drafts based on value, fit, and process
- Analyze each team's haul objectively
- Consider both immediate impact and long-term value
- Reference consensus rankings and where teams deviated
- Acknowledge that draft grades are inherently uncertain`,
  },
  trade_deadline: {
    entertainer: `
TRADE DEADLINE MODE:
- Maximum drama - who made moves, who stood pat
- Call out teams that should have been buyers or sellers
- Grade the deadline deals with strong opinions
- Identify the biggest winners and losers
- Build narrative around playoff positioning`,
    analyst: `
TRADE DEADLINE MODE:
- Analyze trade values and roster implications
- Evaluate buyer/seller decisions objectively
- Consider playoff odds and roster construction
- Grade deals based on asset value exchanged
- Project how moves affect championship odds`,
  },
  playoffs: {
    entertainer: `
PLAYOFF MODE:
- MAXIMUM INTENSITY - every game is life or death
- The stakes are real, treat them that way
- Call your shots on who advances
- Reference regular season narratives paying off (or not)
- Build drama around matchups and storylines`,
    analyst: `
PLAYOFF MODE:
- Acknowledge increased variance in small samples
- Analyze matchup advantages and roster edges
- Reference regular season performance as baseline
- Note that anything can happen in single-game elimination
- Focus on process even when results are random`,
  },
  championship: {
    entertainer: `
CHAMPIONSHIP MODE:
- This is THE moment - treat it with appropriate gravity
- Crown the champion with the respect they deserve
- Reference the journey that got them here
- Call out the runner-up's performance
- Set up offseason narratives and dynasty implications`,
    analyst: `
CHAMPIONSHIP MODE:
- Analyze the championship matchup objectively
- Reference the paths both teams took to get here
- Acknowledge the variance in a single-game final
- Evaluate roster construction that led to success
- Consider dynasty implications going forward`,
  },
};

export interface GenerateSectionOptions {
  persona: PersonaType;
  sectionType: string;
  context: string;
  constraints?: string;
  maxTokens?: number;
  episodeType?: string; // For episode-specific prompting
}

export async function generateSection(options: GenerateSectionOptions): Promise<string> {
  const { persona, sectionType, context, constraints, maxTokens = 400, episodeType } = options;
  const config = PERSONA_CONFIGS[persona];

  // Build system prompt with episode-specific additions if applicable
  let systemPrompt = config.systemPrompt;
  if (episodeType && EPISODE_PROMPT_ADDITIONS[episodeType]) {
    systemPrompt += '\n\n' + EPISODE_PROMPT_ADDITIONS[episodeType][persona];
  }
  // Handle playoff episodes (playoffs_preview, playoffs_round)
  if (episodeType?.startsWith('playoffs')) {
    systemPrompt += '\n\n' + EPISODE_PROMPT_ADDITIONS.playoffs[persona];
  }

  const userPrompt = `Generate the "${sectionType}" section for this fantasy football newsletter.

CONTEXT:
${context}

${constraints ? `CONSTRAINTS:\n${constraints}\n` : ''}
Write your section now. Be concise but engaging. Do not include section headers - just the content.
Remember to use your signature style and voice. Make it feel like YOU wrote this.`;

  const response = await generateWithGroq({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature,
    maxTokens,
  });

  return response.content.trim();
}

// ============ Staged Generation Support ============

export interface StagedGenerationState {
  season: number;
  week: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  sectionsCompleted: string[];
  sectionsPending: string[];
  currentSection: string | null;
  error: string | null;
  generatedContent: Record<string, { entertainer: string; analyst: string }>;
}

export function createStagedState(season: number, week: number): StagedGenerationState {
  return {
    season,
    week,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    sectionsCompleted: [],
    sectionsPending: ['Intro', 'MatchupRecaps', 'WaiversAndFA', 'Trades', 'Spotlight', 'Forecast', 'FinalWord'],
    currentSection: null,
    error: null,
    generatedContent: {},
  };
}

// Section order for staged generation (spread across Tuesday-Wednesday)
export const SECTION_GENERATION_ORDER = [
  'Intro',
  'MatchupRecaps', 
  'WaiversAndFA',
  'Trades',
  'Spotlight',
  'Forecast',
  'FinalWord',
];
