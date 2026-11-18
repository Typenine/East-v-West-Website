/**
 * A per-request promise cache for a multi-roster taxi audit.
 * This does not persist between requests and never caches database writes.
 */
export function createTaxiValidationRequestCache() {
  const pending = new Map<string, Promise<unknown>>();
  return {
    once<T>(key: string, loader: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing as Promise<T>;
      const promise = loader().catch((error) => {
        pending.delete(key);
        throw error;
      });
      pending.set(key, promise);
      return promise;
    },
  };
}
export type TaxiValidationRequestCache = ReturnType<typeof createTaxiValidationRequestCache>;
