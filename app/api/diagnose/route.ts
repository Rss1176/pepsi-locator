import { NextResponse } from 'next/server';
import { diagnose, diagnoseAll } from '@/lib/diagnose';
import { RETAILER_IDS } from '@/lib/catalog';
import type { RetailerId } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Reports what each retailer's page actually yielded: how many candidates were
 * extracted, which titles read as Pepsi Max, and which pack formats went
 * unrecognised. Only the fixed retailer search URLs are ever fetched.
 *
 *   /api/diagnose                  every retailer, compact
 *   /api/diagnose?retailer=ocado   one retailer, with page structure details
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('retailer');

  if (!requested) {
    return NextResponse.json(await diagnoseAll(), { headers: { 'cache-control': 'no-store' } });
  }

  if (!RETAILER_IDS.includes(requested as RetailerId)) {
    return NextResponse.json(
      { error: `Unknown retailer. Use one of: ${RETAILER_IDS.join(', ')}` },
      { status: 400 },
    );
  }

  return NextResponse.json(await diagnose(requested as RetailerId), {
    headers: { 'cache-control': 'no-store' },
  });
}
