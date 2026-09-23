import { ADAPTERS, adapterFor } from './retailers';
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
