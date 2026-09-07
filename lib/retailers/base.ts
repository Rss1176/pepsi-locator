import { retailerMeta } from '../catalog';
import { detectFormat, isPepsiMax, parsePrice } from '../match';
import type { Offer, RetailerId, RetailerStatus } from '../types';
import { BlockedError, type RequestOptions } from './http';
import type { RawProduct } from './extract';

export interface RetailerAdapter {
  id: RetailerId;
  /** Public search page a shopper would land on, also used as the link fallback. */
  searchUrl: string;
  /** Origin used to make relative product links absolute. */
  origin: string;
  /**
   * Read the retailer's public search results. Throw BlockedError when the site
   * turns the request away so the UI can say so honestly rather than showing a gap.
   */
  collect(options: RequestOptions): Promise<RawProduct[]>;
  /** Set when a retailer publishes no online prices at all. */
  unsupported?: string;
}

/** Turn loosely typed scrape results into validated offers for the tracked formats. */
export function toOffers(retailer: RetailerId, raw: RawProduct[], capturedAt: string): Offer[] {
  const meta = retailerMeta(retailer);
  const byKey = new Map<string, Offer>();

  for (const item of raw) {
    const title = item.title?.trim();
    if (!title || !isPepsiMax(title)) continue;

    const format = detectFormat(title);
    if (!format) continue;

    const price = parsePrice(item.price);
    if (price === null) continue;

    const loyaltyPrice = item.loyaltyPrice === undefined ? null : parsePrice(item.loyaltyPrice);

    const offer: Offer = {
      retailer,
      format,
      title,
      price,
      url: item.url ?? `https://www.${meta.domain}`,
      inStock: item.inStock ?? true,
      capturedAt,
      source: 'live',
    };

    if (loyaltyPrice !== null && loyaltyPrice > 0 && loyaltyPrice < price) {
      offer.loyaltyPrice = loyaltyPrice;
      offer.loyaltyScheme = meta.loyaltyScheme;
    }

    // Keep the cheapest reading per retailer and format.
    const key = `${retailer}:${format}`;
    const existing = byKey.get(key);
    if (!existing || offer.price < existing.price) byKey.set(key, offer);
  }

  return [...byKey.values()];
}

export interface AdapterRun {
  offers: Offer[];
  status: RetailerStatus;
}

/** Run one adapter, converting every failure mode into a reportable status. */
export async function runAdapter(adapter: RetailerAdapter, timeoutMs: number): Promise<AdapterRun> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  const status = (state: RetailerStatus['state'], offers: number, message?: string): RetailerStatus => ({
    retailer: adapter.id,
    state,
    offers,
    message,
    durationMs: Date.now() - startedAt,
    checkedAt,
  });

  if (adapter.unsupported) {
    return { offers: [], status: status('unsupported', 0, adapter.unsupported) };
  }

  try {
    const raw = await adapter.collect({ timeoutMs });
    const offers = toOffers(adapter.id, raw, checkedAt);

    if (offers.length === 0) {
      return { offers, status: status('empty', 0, 'Reached the site but found no tracked Pepsi Max format') };
    }

    return { offers, status: status('ok', offers.length) };
  } catch (error) {
    if (error instanceof BlockedError) {
      return { offers: [], status: status('blocked', 0, error.message) };
    }

    const message =
      error instanceof Error
        ? error.name === 'AbortError' || error.name === 'TimeoutError'
          ? 'Request timed out'
          : error.message
        : 'Unknown error';

    return { offers: [], status: status('error', 0, message) };
  }
}
