import { RETAILERS } from '../catalog';
import { detectFormat, isPepsiMax, parsePrice } from '../match';
import { jsonLdBlocks } from '../retailers/extract';
import { fetchHtml, type RequestOptions } from '../retailers/http';
import type { Offer, RetailerId } from '../types';

/**
 * Trolley publishes one page per product carrying every supermarket's price.
 * One request reaches retailers that refuse a direct request from a datacentre
 * address, so this covers the grocers whose own sites return 403.
 */
const ORIGIN = 'https://www.trolley.co.uk';

/** Tried in order; the first that yields offers wins. */
const SEARCH_URLS = [
  `${ORIGIN}/search?q=pepsi+max`,
  `${ORIGIN}/search/?q=pepsi+max`,
  `${ORIGIN}/product/pepsi-max/TPQ612`,
];

/** Seller names as Trolley writes them, mapped to our retailer ids. */
const SELLERS: Record<string, RetailerId> = {
  tesco: 'tesco',
  asda: 'asda',
  sainsburys: 'sainsburys',
  "sainsbury's": 'sainsburys',
  sainsbury: 'sainsburys',
  morrisons: 'morrisons',
  aldi: 'aldi',
  lidl: 'lidl',
  coop: 'coop',
  'co-op': 'coop',
  'co-operative': 'coop',
  waitrose: 'waitrose',
  iceland: 'iceland',
  ocado: 'ocado',
};

export function matchSeller(name: string): RetailerId | null {
  const key = name.trim().toLowerCase();
  if (SELLERS[key]) return SELLERS[key];

  // Trolley sometimes qualifies a name, for example "Tesco Groceries".
  for (const [seller, id] of Object.entries(SELLERS)) {
    if (key.startsWith(seller)) return id;
  }
  return null;
}

interface SellerOffer {
  title: string;
  seller: string;
  price: unknown;
  url?: string;
}

/**
 * Comparison pages describe a Product whose offers array carries one entry per
 * shop, each naming its seller. That is the shape this reads.
 */
export function sellerOffersFromJsonLd(html: string): SellerOffer[] {
  const found: SellerOffer[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;

    const type = record['@type'];
    const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')];

    if (types.includes('ItemList') && Array.isArray(record.itemListElement)) {
      for (const element of record.itemListElement) {
        visit((element as Record<string, unknown>)?.item ?? element);
      }
      return;
    }

    if (!types.includes('Product') || typeof record.name !== 'string') return;

    const offers = Array.isArray(record.offers) ? record.offers : record.offers ? [record.offers] : [];
    for (const entry of offers) {
      const offer = entry as Record<string, unknown>;
      const seller = offer.seller as Record<string, unknown> | undefined;
      const sellerName =
        typeof seller?.name === 'string' ? seller.name : typeof offer.seller === 'string' ? offer.seller : null;

      if (!sellerName) continue;

      found.push({
        title: record.name,
        seller: sellerName,
        price: offer.price ?? offer.lowPrice,
        url: typeof offer.url === 'string' ? offer.url : undefined,
      });
    }
  };

  for (const block of jsonLdBlocks(html)) visit(block);
  return found;
}

/** Read Pepsi Max prices for every supermarket the comparison page lists. */
export async function collectTrolley(options: RequestOptions): Promise<Offer[]> {
  const capturedAt = new Date().toISOString();
  const offers = new Map<string, Offer>();

  for (const url of SEARCH_URLS) {
    let html: string;
    try {
      html = await fetchHtml(url, options);
    } catch {
      continue;
    }

    for (const raw of sellerOffersFromJsonLd(html)) {
      if (!isPepsiMax(raw.title)) continue;

      const format = detectFormat(raw.title);
      const retailer = matchSeller(raw.seller);
      const price = parsePrice(raw.price);
      if (!format || !retailer || price === null) continue;

      const key = `${retailer}:${format}`;
      const existing = offers.get(key);
      if (existing && existing.price <= price) continue;

      offers.set(key, {
        retailer,
        format,
        title: raw.title,
        price,
        url: raw.url ?? `https://www.${RETAILERS[retailer].domain}`,
        via: 'Trolley',
        inStock: true,
        capturedAt,
        source: 'live',
      });
    }

    if (offers.size > 0) break;
  }

  return [...offers.values()];
}

export const TROLLEY_URLS = SEARCH_URLS;
