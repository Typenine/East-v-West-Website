/**
 * Gemini Context Cache Manager
 * Caches static newsletter content (system prompts + memory snapshots) to reduce
 * token usage across the ~50 LLM calls per generation run.
 *
 * Uses @google/generative-ai/server's GoogleAICacheManager.
 * Falls back gracefully (returns null) if caching is unavailable or the content
 * is too small to meet the 4096-token minimum.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';
import type { GenerativeModel, CachedContent } from '@google/generative-ai';

export interface CacheInitOptions {
  cacheKey: string;            // e.g. "2025-14-regular"
  entertainerPrompt: string;
  analystPrompt: string;
  teamMemory: string;
  relationshipMemory: string;
}

interface ActiveCache {
  cacheName: string;
  expiresAt: number; // epoch ms
}

// In-memory store: cacheKey → active cache info
const _activeCaches = new Map<string, ActiveCache>();

// Model that supports context caching with a lower token minimum
const CACHE_MODEL = 'models/gemini-1.5-flash';
const CACHE_TTL_SECONDS = 3600;
const MIN_TOKEN_ESTIMATE = 4096;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Attempt to create a Gemini context cache for the static content shared
 * across all sections of a newsletter generation run.
 *
 * Returns the cacheId string on success, or null if caching is not possible.
 */
export async function initNewsletterCache(opts: CacheInitOptions): Promise<string | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const combined =
      opts.entertainerPrompt +
      opts.analystPrompt +
      opts.teamMemory +
      opts.relationshipMemory;

    if (estimateTokens(combined) < MIN_TOKEN_ESTIMATE) {
      console.log('[Cache] Static content too small for Gemini context caching — skipping');
      return null;
    }

    const cacheManager = new GoogleAICacheManager(apiKey);

    const created = await cacheManager.create({
      model: CACHE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                '=== ENTERTAINER SYSTEM PROMPT ===',
                opts.entertainerPrompt,
                '',
                '=== ANALYST SYSTEM PROMPT ===',
                opts.analystPrompt,
                '',
                '=== TEAM MEMORY ===',
                opts.teamMemory,
                '',
                '=== RELATIONSHIP MEMORY ===',
                opts.relationshipMemory,
              ].join('\n'),
            },
          ],
        },
      ],
      ttlSeconds: CACHE_TTL_SECONDS,
    });

    if (!created.name) {
      console.warn('[Cache] Cache created but no name returned — skipping');
      return null;
    }

    const cacheName: string = created.name;
    const expiresAt = Date.now() + CACHE_TTL_SECONDS * 1000;
    _activeCaches.set(opts.cacheKey, { cacheName, expiresAt });

    console.log(`[Cache] Created Gemini context cache: ${cacheName} (expires in ${CACHE_TTL_SECONDS}s)`);
    return cacheName;

  } catch (err) {
    console.warn('[Cache] Failed to create Gemini context cache (falling back to uncached):', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Get a GenerativeModel that uses the previously created cache.
 * Returns null if the cache is not found or has expired.
 */
export async function getCachedGeminiModel(cacheId: string): Promise<GenerativeModel | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    // Look up by cacheName (cacheId is the cacheName returned by the API)
    let entry: ActiveCache | undefined;
    for (const [, v] of _activeCaches) {
      if (v.cacheName === cacheId) {
        entry = v;
        break;
      }
    }
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      console.warn(`[Cache] Cache ${cacheId} has expired`);
      return null;
    }

    const client = new GoogleGenerativeAI(apiKey);

    // Build a minimal CachedContent descriptor — name and model are required
    const cachedContent: CachedContent = {
      name: entry.cacheName,
      model: CACHE_MODEL,
      contents: [],
    };

    return client.getGenerativeModelFromCachedContent(cachedContent);

  } catch (err) {
    console.warn('[Cache] getCachedGeminiModel failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Delete the Gemini context cache for a given cacheId. Call at end of generation.
 */
export async function deleteNewsletterCache(cacheId: string): Promise<void> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    const cacheManager = new GoogleAICacheManager(apiKey);
    await cacheManager.delete(cacheId);

    // Remove from local map
    for (const [k, v] of _activeCaches) {
      if (v.cacheName === cacheId) {
        _activeCaches.delete(k);
        break;
      }
    }

    console.log(`[Cache] Deleted Gemini context cache: ${cacheId}`);
  } catch (err) {
    console.warn('[Cache] Failed to delete cache (may have already expired):', err instanceof Error ? err.message : String(err));
  }
}
