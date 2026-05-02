import { afterEach, describe, expect, it } from 'vitest';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { verifySession } from '@/lib/server/auth';

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    return;
  }
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

describe('auth hardening helpers', () => {
  const originalAdminSecret = process.env.EVW_ADMIN_SECRET;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalAdminSecret === undefined) delete process.env.EVW_ADMIN_SECRET;
    else process.env.EVW_ADMIN_SECRET = originalAdminSecret;
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    setNodeEnv(originalNodeEnv);
  });

  it('keeps the simple default admin cookie when no admin secret is configured', () => {
    delete process.env.EVW_ADMIN_SECRET;

    expect(isAdminCookieValue('002023')).toBe(true);
  });

  it('accepts the configured admin cookie value when set', () => {
    process.env.EVW_ADMIN_SECRET = 'configured-secret';

    expect(isAdminCookieValue('configured-secret')).toBe(true);
    expect(isAdminCookieValue('002023')).toBe(false);
  });

  it('requires cron auth in production when a cron secret is set', () => {
    setNodeEnv('production');
    process.env.CRON_SECRET = 'cron-secret';

    expect(isCronAuthorized(new Request('https://example.test', {
      headers: { Authorization: 'Bearer cron-secret' },
    }))).toBe(true);
    expect(isCronAuthorized(new Request('https://example.test', {
      headers: { 'x-cron-secret': 'wrong-secret' },
    }))).toBe(false);
  });

  it('returns null for malformed session signatures instead of throwing', () => {
    expect(verifySession('eyJmb28iOiJiYXIifQ.short')).toBeNull();
  });
});
