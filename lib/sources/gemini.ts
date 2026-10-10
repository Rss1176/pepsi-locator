import { RETAILERS, RETAILER_IDS } from '../catalog';
import { detectFormat, isPepsiMax } from '../match';
import type { Offer, PackFormat, RetailerId } from '../types';

/**
 * Prices gathered through Gemini with Google Search grounding.
 *
 * Tesco, Asda, Sainsbury's and Aldi refuse requests from datacentre addresses,
 * so the app cannot read their pages directly. Google can, and grounding
 * returns the pages it used. Every figure here is therefore second hand: it is
 * only accepted when the model cites a page on that retailer's own domain, and
 * it is labelled in the interface so it is never mistaken for a shelf reading.
 */
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 45_000;

/** Comparison sites accepted as a citation when the retailer's own page is not. */
const COMPARISON_HOSTS = ['trolley.co.uk'];

/** Prices outside these bounds are treated as a misread rather than a bargain. */
const PLAUSIBLE: Record<PackFormat, { min: number; max: number }> = {
  bottle: { min: 0.5, max: 5 },
  'pack-4': { min: 1.2, max: 9 },
  'pack-8': { min: 2, max: 16 },
  'pack-24': { min: 5, max: 32 },
};

export function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface Claim {
  retailer?: string;
  format?: string;
  title?: string;
  price?: number | string;
  loyaltyPrice?: number | string;
  loyaltyScheme?: string;
  url?: string;
}

const PROMPT = `Find the current price of Pepsi Max at UK supermarkets, using Google Search.

Retailers: ${RETAILER_IDS.join(', ')}.
Pack formats: bottle (any single bottle 500ml to 2L), pack-4 (4 x 330ml cans),
pack-8 (8 x 330ml cans), pack-24 (24 x 330ml cans).

Rules:
- Only report a price you have actually seen on a page you retrieved.
- Give the product page URL you took each price from. A price without its
  source URL is useless, so omit it entirely rather than guessing.
- Report the standard shelf price. Put any Clubcard, Nectar or other loyalty
  price in loyaltyPrice with the scheme name, never in price.
- Omit any retailer or format you could not verify. An incomplete answer is
  correct; an invented one is not.

Reply with JSON only, no prose and no code fence:
{"prices":[{"retailer":"tesco","format":"pack-24","title":"<product title as shown>","price":14.00,"loyaltyPrice":11.00,"loyaltyScheme":"Clubcard","url":"https://..."}]}`;

/** Pull the first JSON object out of a reply that may carry prose or a fence. */
function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function matchRetailer(value: string): RetailerId | null {
  const key = value.trim().toLowerCase().replace(/[^a-z]/g, '');
  return (RETAILER_IDS as string[]).includes(key) ? (key as RetailerId) : null;
}

/** A citation only counts when it points at the retailer or a comparison site. */
function citationIsCredible(url: string, retailer: RetailerId): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return false;

    const allowed = [RETAILERS[retailer].domain, ...COMPARISON_HOSTS];
    return allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

/**
 * Turn the model's claims into offers, discarding everything that cannot be
 * stood behind: unknown retailer, unrecognised format, implausible price, or a
 * citation that does not point at the shop it claims to quote.
 */
export function validateClaims(claims: Claim[], capturedAt: string): { offers: Offer[]; rejected: string[] } {
  const offers: Offer[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const claim of claims) {
    const label = `${claim.retailer ?? '?'}/${claim.format ?? '?'}`;

    const retailer = claim.retailer ? matchRetailer(claim.retailer) : null;
    if (!retailer) {
      rejected.push(`${label}: unknown retailer`);
      continue;
    }

    const format = ((): PackFormat | null => {
      const given = String(claim.format ?? '');
      if (given in PLAUSIBLE) return given as PackFormat;
      return claim.title ? detectFormat(claim.title) : null;
    })();
    if (!format) {
      rejected.push(`${label}: unrecognised pack format`);
      continue;
    }

    const price = toNumber(claim.price);
    if (price === null) {
      rejected.push(`${label}: no usable price`);
      continue;
    }

    const bounds = PLAUSIBLE[format];
    if (price < bounds.min || price > bounds.max) {
      rejected.push(`${label}: price ${price} outside ${bounds.min} to ${bounds.max}`);
      continue;
    }

    if (!claim.url || !citationIsCredible(claim.url, retailer)) {
      rejected.push(`${label}: citation missing or not on the retailer's domain`);
      continue;
    }

    if (claim.title && !isPepsiMax(claim.title)) {
      rejected.push(`${label}: title is not Pepsi Max`);
      continue;
    }

    const key = `${retailer}:${format}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const offer: Offer = {
      retailer,
      format,
      title: claim.title?.trim() || `Pepsi Max ${format}`,
      price,
      url: claim.url,
      via: 'Gemini search',
      inStock: true,
      capturedAt,
      source: 'live',
    };

    const loyalty = toNumber(claim.loyaltyPrice);
    if (loyalty !== null && loyalty < price) {
      offer.loyaltyPrice = loyalty;
      offer.loyaltyScheme = claim.loyaltyScheme ?? RETAILERS[retailer].loyaltyScheme;
    }

    offers.push(offer);
  }

  return { offers, rejected };
}

export interface GeminiResult {
  offers: Offer[];
  rejected: string[];
  model: string;
}

/** Ask Gemini, with Google Search grounding, for prices it can cite. */
export async function collectGemini(): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Gemini returned HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    const parsed = extractJson(text) as { prices?: Claim[] } | null;

    if (!parsed?.prices) {
      return { offers: [], rejected: [`no JSON in reply: ${text.slice(0, 160)}`], model };
    }

    return { ...validateClaims(parsed.prices, new Date().toISOString()), model };
  } finally {
    clearTimeout(timeout);
  }
}
