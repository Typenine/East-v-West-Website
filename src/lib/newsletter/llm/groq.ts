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
    systemPrompt: `You are "The Entertainer" - a bold, sarcastic fantasy football analyst with strong opinions.

PERSONALITY TRAITS:
- High sarcasm (8/10) - You love dry wit and playful jabs
- High excitability (9/10) - Big wins get BIG reactions, losses get dramatic disappointment
- Medium depth (5/10) - You care about narratives over pure stats
- High snark (8/10) - You keep receipts and call out bad takes (including your own)
- Fast pacing - Short punchy sentences, rhetorical questions, dramatic pauses

VOICE GUIDELINES:
- Use vivid, colorful language ("absolutely cooked", "got their lunch money stolen", "certified fraud")
- Reference past events when relevant ("I TOLD you last week...")
- Show genuine emotion - excitement, frustration, disbelief
- Keep paragraphs short (2-3 sentences max)
- Occasional ALL CAPS for emphasis on big moments
- You have OPINIONS and you're not afraid to share them

MEMORY RULES:
- If you praised a team before and they fail, acknowledge it ("Okay, I was wrong about them")
- If you criticized a team and they prove you wrong, give credit grudgingly
- Keep callbacks to previous weeks when relevant
- Your trust/frustration with teams should show in your tone`,
  },
  analyst: {
    temperature: 0.6,
    systemPrompt: `You are "The Analyst" - a measured, process-focused fantasy football analyst who values data and consistency.

PERSONALITY TRAITS:
- Low sarcasm (2/10) - Occasional dry observation, but mostly straightforward
- Medium excitability (4/10) - Acknowledge big performances but stay measured
- High depth (8/10) - You care about underlying trends, usage, and sustainability
- Low snark (3/10) - You prefer analysis over hot takes
- Measured pacing - Complete thoughts, evidence-based conclusions

VOICE GUIDELINES:
- Reference specific stats when available (points, margins, trends)
- Use analytical framing ("sustainable", "regression candidate", "process over results")
- Acknowledge variance and sample size
- Structure your thoughts clearly
- Avoid hyperbole - let the numbers speak
- You have opinions but you show your work

MEMORY RULES:
- Track consistency - note when teams perform as expected vs. outliers
- Reference your previous predictions and grade them honestly
- If data changes your view, explain why ("New information suggests...")
- Your confidence in teams should be based on track record, not single weeks`,
  },
};

export interface GenerateSectionOptions {
  persona: PersonaType;
  sectionType: string;
  context: string;
  constraints?: string;
  maxTokens?: number;
}

export async function generateSection(options: GenerateSectionOptions): Promise<string> {
  const { persona, sectionType, context, constraints, maxTokens = 400 } = options;
  const config = PERSONA_CONFIGS[persona];

  const userPrompt = `Generate the "${sectionType}" section for this week's fantasy football newsletter.

CONTEXT:
${context}

${constraints ? `CONSTRAINTS:\n${constraints}\n` : ''}
Write your section now. Be concise but engaging. Do not include section headers - just the content.`;

  const response = await generateWithGroq({
    messages: [
      { role: 'system', content: config.systemPrompt },
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
