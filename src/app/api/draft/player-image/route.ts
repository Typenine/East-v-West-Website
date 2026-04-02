import { NextRequest, NextResponse } from 'next/server';
import { getPlayerVideos } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId');
  if (!playerId) return new NextResponse(null, { status: 404 });

  try {
    const videos = await getPlayerVideos();
    const entry = videos.find(v => v.playerId === playerId);
    if (!entry?.imageUrl) return new NextResponse(null, { status: 404 });

    const imageUrl = entry.imageUrl;

    if (imageUrl.startsWith('data:')) {
      const commaIdx = imageUrl.indexOf(',');
      if (commaIdx === -1) return new NextResponse(null, { status: 500 });
      const header = imageUrl.slice(0, commaIdx);
      const base64Data = imageUrl.slice(commaIdx + 1);
      const contentType = header.split(':')[1]?.split(';')[0] || 'image/jpeg';
      const buffer = Buffer.from(base64Data, 'base64');
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'content-type': contentType,
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    return NextResponse.redirect(imageUrl);
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
