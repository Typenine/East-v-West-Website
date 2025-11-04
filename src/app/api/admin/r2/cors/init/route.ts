export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const origins: string[] = [];
  const publicBase = (process.env.R2_PUBLIC_BASE || '').trim();
  const vercelUrl = (process.env.VERCEL_URL || '').trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (publicBase) origins.push(publicBase.replace(/\/$/, ''));
  if (siteUrl) origins.push(siteUrl.replace(/\/$/, ''));
  if (vercelUrl) origins.push(`https://${vercelUrl}`);
  origins.push('http://localhost:3000');

  const config = {
    CORSRules: [
      {
        AllowedOrigins: Array.from(new Set(origins)),
        AllowedMethods: ['GET', 'PUT', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag', 'Content-Length'],
        MaxAgeSeconds: 300,
      },
    ],
  };

  const instruction = [
    'Copy this JSON and configure your Cloudflare R2 bucket CORS with these values (via dashboard or API).',
    'Ensure your site origin(s) are present in AllowedOrigins. Then retry the admin storage test.',
  ];

  return Response.json({ ok: true, config, instruction });
}
