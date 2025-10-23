type EmailPayload = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
};

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const from = payload.from || process.env.RESEND_FROM || 'onboarding@resend.dev';
  const to = Array.isArray(payload.to) ? payload.to : [payload.to];
  const body = {
    from,
    to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  };
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`Resend email failed: ${resp.status} ${resp.statusText} ${msg}`);
  }
}
