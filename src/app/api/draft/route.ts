import { handleDraftGet, handleDraftPost } from '@/server/draft-api-v149';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handleDraftGet;
export const POST = handleDraftPost;
