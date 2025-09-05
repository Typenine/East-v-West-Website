import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const path = searchParams.get('path') || '/';

  const secret = process.env.REVALIDATE_TOKEN;
  if (!secret || token !== secret) {
    return NextResponse.json(
      { revalidated: false, message: 'Invalid token' },
      { status: 401 }
    );
  }

  // Trigger ISR revalidation for the specified path (defaults to Home)
  revalidatePath(path);
  return NextResponse.json({ revalidated: true, path });
}
