type AuthEvent = {
  type: 'login_success' | 'login_fail' | 'login_lock';
  team: string;
  ip: string;
  ok: boolean;
  reason?: string;
};

export async function logAuthEvent(e: AuthEvent): Promise<void> {
  try {
    const { put } = await import('@vercel/blob');
    const key = `logs/auth/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    await put(key, JSON.stringify({ ts: new Date().toISOString(), ...e }), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
    });
  } catch {
    // best-effort only
  }
}
