import { NextResponse } from 'next/server';
import { aggregate } from '@/lib/aggregate';
import { loadAggregate } from '@/lib/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Current cheapest prices per pack format, plus the state of every retailer sweep. */
export async function GET() {
  const { snapshot } = await loadAggregate();

  return NextResponse.json(
    { ...aggregate(snapshot), offers: snapshot.offers },
    { headers: { 'cache-control': 'no-store' } },
  );
}
