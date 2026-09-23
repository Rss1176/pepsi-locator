import { NextResponse } from 'next/server';
import { diagnose, diagnoseAll, diagnoseTrolley, isProbeAllowed, probeUrl } from '@/lib/diagnose';
import { RETAILER_IDS } from '@/lib/catalog';
import type { RetailerId } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * Reports what each source actually yielded, so a parser that returns nothing
 * can be corrected against the real page.
 *
 *   /api/diagnose                  every retailer, compact
 *   /api/diagnose?retailer=ocado   one retailer, with page structure details
 *   /api/diagnose?source=trolley   the comparison site
 *   /api/diagnose?url=https://...  one page from the allowed host list
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const url = params.get('url');
  if (url) {
    if (!isProbeAllowed(url)) {
      return json({ error: 'That URL is not on the allowed host list' }, 400);
    }
    try {
      return json(await probeUrl(url));
    } catch (error) {
      return json({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (params.get('source') === 'trolley') {
    return json(await diagnoseTrolley());
  }

  const retailer = params.get('retailer');
  if (!retailer) return json(await diagnoseAll());

  if (!RETAILER_IDS.includes(retailer as RetailerId)) {
    return json({ error: `Unknown retailer. Use one of: ${RETAILER_IDS.join(', ')}` }, 400);
  }

  return json(await diagnose(retailer as RetailerId));
}
