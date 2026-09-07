import { NextResponse } from 'next/server';
import { scanAll } from '@/lib/scan';
import { isPersistent } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sweep every retailer. Vercel Cron calls this on a schedule with the
 * CRON_SECRET bearer token. When no secret is configured the route is open,
 * which is the expected setup for local development.
 */
async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const authorization = request.headers.get('authorization');
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  const result = await scanAll();

  return NextResponse.json(
    {
      generatedAt: result.snapshot.generatedAt,
      liveOffers: result.found,
      persisted: isPersistent(),
      statuses: result.statuses,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
