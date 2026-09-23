import { ADAPTERS, adapterFor } from './retailers';
import { collectTrolley, sellerOffersFromJsonLd, TROLLEY_URLS } from './sources/trolley';
import { fetchHtml } from './retailers/http';
import { jsonLdBlocks, productsFromJsonLd } from './retailers/extract';
import { toOffers } from './retailers/base';
import { detectFormat, isPepsiMax, parsePrice } from './match';
import type { RetailerId } from './types';

const TIMEOUT_MS = 12_000;

export interface Diagnostic {
  retailer: RetailerId;
  searchUrl: string;
  /** What the sweep would report for this retailer. */
  outcome: 'ok' | 'empty' | 'error' | 'unsupported';
  error?: string;
  /** Everything the extractor pulled off the page, before any filtering. */
  candidates: number;
  /** Candidate titles that read as Pepsi Max. */
  pepsiTitles: string[];
  /**
   * Pepsi Max titles whose pack format was not recognised. These are the ones
   * that make a retailer report empty despite the page carrying prices.
   */
  unrecognisedFormat: { title: string; price: unknown; parsed: number | null }[];
  /** A sample of raw candidates, shown when nothing matched at all. */
  sample: { title: string; price: unknown }[];
  offers: { format: string; price: number; title: string }[];
  probe?: Record<string, unknown>;
}

/**
 * Explain what a retailer's page actually yielded. Deployments can reach sites
 * that this development environment cannot, so this runs the same extraction as
 * a sweep and reports the intermediate state rather than only the final count.
 */
export async function diagnose(id: RetailerId, includeProbe = true): Promise<Diagnostic> {
  const adapter = adapterFor(id);
  if (!adapter) throw new Error(`Unknown retailer: ${id}`);

  const base: Diagnostic = {
    retailer: id,
    searchUrl: adapter.searchUrl,
    outcome: 'empty',
    candidates: 0,
    pepsiTitles: [],
    unrecognisedFormat: [],
    sample: [],
    offers: [],
  };

  if (adapter.unsupported) {
    return { ...base, outcome: 'unsupported', error: adapter.unsupported };
  }

  let raw;
  try {
    raw = await adapter.collect({ timeoutMs: TIMEOUT_MS });
  } catch (error) {
    return { ...base, outcome: 'error', error: error instanceof Error ? error.message : String(error) };
  }

  const pepsi = raw.filter((item) => typeof item.title === 'string' && isPepsiMax(item.title));
  const offers = toOffers(id, raw, new Date().toISOString());

  const result: Diagnostic = {
    ...base,
    outcome: offers.length > 0 ? 'ok' : 'empty',
    candidates: raw.length,
    pepsiTitles: pepsi.slice(0, 25).map((item) => item.title),
    unrecognisedFormat: pepsi
      .filter((item) => detectFormat(item.title) === null)
      .slice(0, 15)
      .map((item) => ({ title: item.title, price: item.price, parsed: parsePrice(item.price) })),
    sample: pepsi.length === 0 ? raw.slice(0, 12).map((item) => ({ title: item.title, price: item.price })) : [],
    offers: offers.map((offer) => ({ format: offer.format, price: offer.price, title: offer.title })),
  };

  if (includeProbe && offers.length === 0 && adapter.probe) {
    try {
      result.probe = await adapter.probe({ timeoutMs: TIMEOUT_MS });
    } catch (error) {
      result.probe = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return result;
}

/** Compact diagnosis of every retailer, small enough to read in one go. */
export async function diagnoseAll(): Promise<Diagnostic[]> {
  return Promise.all(ADAPTERS.map((adapter) => diagnose(adapter.id, false)));
}

/** Hosts the URL probe may read. Anything else is refused. */
const PROBE_HOSTS = [
  'trolley.co.uk',
  'tesco.com',
  'asda.com',
  'sainsburys.co.uk',
  'morrisons.com',
  'aldi.co.uk',
  'lidl.co.uk',
  'coop.co.uk',
  'waitrose.com',
  'iceland.co.uk',
  'ocado.com',
];

export function isProbeAllowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return PROBE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * Read one allowed page and report its shape. This exists because the
 * development environment cannot reach these sites, so a parser can only be
 * written against markup reported back from a deployment.
 */
export async function probeUrl(url: string): Promise<Record<string, unknown>> {
  const html = await fetchHtml(url, { timeoutMs: TIMEOUT_MS });
  const sellerOffers = sellerOffersFromJsonLd(html);

  return {
    url,
    bytes: html.length,
    title: html.match(/<title[^>]*>([\s\S]{0,120}?)<\/title>/i)?.[1]?.trim(),
    jsonLdBlocks: jsonLdBlocks(html).length,
    jsonLdProducts: productsFromJsonLd(html).length,
    sellerOffers: sellerOffers.length,
    sellerOffersSample: sellerOffers.slice(0, 12),
    pepsiMentions: (html.match(/pepsi/gi) ?? []).length,
    priceSnippets: sample(html, /£\s?\d+[.,]\d{2}/g, 6, 200),
  };
}

/** Short windows of markup around the first few matches, for reading shape. */
function sample(html: string, pattern: RegExp, count: number, width: number): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(pattern)) {
    if (found.length >= count) break;
    const start = Math.max(0, (match.index ?? 0) - width / 2);
    found.push(html.slice(start, start + width).replace(/\s+/g, ' '));
  }
  return found;
}

/** What the comparison site yielded, and which of its URL shapes answered. */
export async function diagnoseTrolley(): Promise<Record<string, unknown>> {
  try {
    const offers = await collectTrolley({ timeoutMs: TIMEOUT_MS });
    return {
      source: 'trolley',
      urlsTried: TROLLEY_URLS,
      offers: offers.length,
      byRetailer: offers.map((offer) => ({ retailer: offer.retailer, format: offer.format, price: offer.price })),
    };
  } catch (error) {
    return { source: 'trolley', error: error instanceof Error ? error.message : String(error) };
  }
}
