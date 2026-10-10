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
const TIMEOUT_MS = 20_000;

/**
 * Preferred models, best first. The list is matched against what the key can
 * actually see, so a model being renamed or withdrawn degrades to the next one
 * instead of failing the whole sweep.
 */
const MODEL_PREFERENCE = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
];

/** How many retailer queries run at once. */
const CONCURRENCY = 4;

/** Retailers to ask about when there is no previous sweep to learn from. */
export const DEFAULT_TARGETS: RetailerId[] = ['tesco', 'asda', 'sainsburys', 'aldi'];

/** Caps a sweep so the grounded calls finish inside the function timeout. */
export const MAX_TARGETS = 6;

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

function promptFor(retailer: RetailerId): string {
  const shop = RETAILERS[retailer];

  return `Find today's price of Pepsi Max at ${shop.name} (${shop.domain}) in the UK, using Google Search.

Pack formats wanted:
- bottle: a single bottle, 500ml to 2 litre
- pack-4: 4 x 330ml cans
- pack-8: 8 x 330ml cans
- pack-24: 24 x 330ml cans

Rules:
- Only report a price you have actually seen on a ${shop.domain} page you retrieved.
- Give that page's URL for every price. A price without its source URL is
  useless, so omit it rather than guessing.
- Report the standard shelf price in "price". Put any ${shop.loyaltyScheme ?? 'loyalty'}
  price in "loyaltyPrice", never in "price".
- Omit any format you could not verify. An incomplete answer is correct; an
  invented one is not. An empty list is a valid answer.

Reply with JSON only, no prose and no code fence:
{"prices":[{"retailer":"${retailer}","format":"pack-24","title":"<title as shown>","price":14.00,"loyaltyPrice":11.00,"loyaltyScheme":"${shop.loyaltyScheme ?? ''}","url":"https://www.${shop.domain}/..."}]}`;
}

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
  /** Retailers the sweep actually asked about. */
  asked: RetailerId[];
}

interface ModelListing {
  models?: { name?: string; supportedGenerationMethods?: string[] }[];
}

/** Resolved once per warm instance; model availability does not change often. */
let cachedModel: string | null = null;

/**
 * Pick a model the key can actually use. An explicit GEMINI_MODEL wins. Other
 * wise the preference list is matched against what the API reports, so a
 * renamed or withdrawn model degrades to the next choice rather than failing.
 */
export async function chooseModel(key: string): Promise<string> {
  const configured = process.env.GEMINI_MODEL;
  if (configured) return configured;
  if (cachedModel) return cachedModel;

  try {
    const response = await fetch(`${ENDPOINT}?pageSize=200`, {
      headers: { 'x-goog-api-key': key },
      cache: 'no-store',
    });

    if (response.ok) {
      const payload = (await response.json()) as ModelListing;
      const usable = (payload.models ?? [])
        .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model) => (model.name ?? '').replace(/^models\//, ''));

      const preferred =
        MODEL_PREFERENCE.find((name) => usable.includes(name)) ??
        usable.find((name) => name.includes('flash') && !name.includes('thinking'));

      if (preferred) {
        cachedModel = preferred;
        return preferred;
      }
    }
  } catch {
    // Fall back to the first preference and let the call itself report failure.
  }

  return MODEL_PREFERENCE[0];
}

/**
 * The grounding tool has been spelled both ways across API revisions, so an
 * argument rejection retries the other spelling before giving up.
 */
const TOOL_SHAPES: Record<string, unknown>[][] = [[{ googleSearch: {} }], [{ google_search: {} }]];

/**
 * A retired model answers with the id to use instead. Following that is more
 * durable than any list compiled by hand, since the next deprecation carries
 * its own fix.
 */
export function parseSuggestedModel(body: string): string | null {
  const suggestion = body.match(/use\s+models\/([A-Za-z0-9.\-_]+)/);
  if (suggestion) return suggestion[1];

  const bare = body.match(/models\/([A-Za-z0-9.\-_]+)\s+for the latest/);
  return bare ? bare[1] : null;
}

/**
 * Any 404 naming another model is worth following, whatever wording it uses.
 * Tying this to a phrase would make recovery depend on error copy staying put.
 */
export function shouldSwitchModel(status: number, body: string): boolean {
  return status === 404 && parseSuggestedModel(body) !== null;
}

/** True when a 400 is about the grounding tool field rather than the request. */
function isToolShapeComplaint(status: number, body: string): boolean {
  if (status !== 400) return false;
  return /google_?search|unknown name|invalid json payload|tools/i.test(body);
}

interface Generated {
  text: string;
  model: string;
}

async function generate(model: string, key: string, prompt: string, depth = 0): Promise<Generated> {
  let lastError = 'no attempt made';

  for (const tools of TOOL_SHAPES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools,
          generationConfig: { temperature: 0 },
        }),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
        cachedModel = model;
        return { text, model };
      }

      const body = (await response.text()).slice(0, 400);
      lastError = `HTTP ${response.status}: ${body}`;

      // A retired model names its successor, so adopt it and carry on.
      if (shouldSwitchModel(response.status, body) && depth < 2) {
        const replacement = parseSuggestedModel(body);
        if (replacement && replacement !== model) {
          clearTimeout(timeout);
          cachedModel = replacement;
          return generate(replacement, key, prompt, depth + 1);
        }
      }

      // Retry the other spelling only when the tool field is what was refused.
      // An auth or quota failure repeats identically, so it fails fast instead.
      if (!isToolShapeComplaint(response.status, body)) throw new Error(lastError);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (!isToolShapeComplaint(400, lastError)) throw new Error(lastError);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError);
}

/** Run tasks a few at a time so a sweep does not open ten calls at once. */
async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    results.push(...(await Promise.all(batch.map(run))));
  }

  return results;
}

/**
 * Ask Gemini, with Google Search grounding, for prices it can cite. Queries are
 * per retailer so the grounding stays focused and each citation is checkable
 * against the shop it claims to quote.
 */
export async function collectGeminiFor(retailers: RetailerId[]): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  if (retailers.length === 0) return { offers: [], rejected: [], model: 'none', asked: [] };

  const model = await chooseModel(key);
  const capturedAt = new Date().toISOString();

  const results = await inBatches(retailers, CONCURRENCY, async (retailer) => {
    try {
      // cachedModel moves on if a retirement notice named a successor.
      const { text, model: used } = await generate(cachedModel ?? model, key, promptFor(retailer));
      const parsed = extractJson(text) as { prices?: Claim[] } | null;

      if (!parsed?.prices) {
        return { offers: [], rejected: [`${retailer}: no JSON in reply: ${text.slice(0, 120)}`], used };
      }

      // Trust the retailer we asked about over the one the reply names.
      const claims = parsed.prices.map((claim) => ({ ...claim, retailer }));
      return { ...validateClaims(claims, capturedAt), used };
    } catch (error) {
      return {
        offers: [],
        rejected: [`${retailer}: ${error instanceof Error ? error.message : String(error)}`],
        used: undefined,
      };
    }
  });

  return {
    offers: results.flatMap((result) => result.offers),
    rejected: results.flatMap((result) => result.rejected),
    model: results.find((result) => result.used)?.used ?? cachedModel ?? model,
    asked: retailers,
  };
}

/** Every retailer, used by the diagnostics. */
export async function collectGemini(): Promise<GeminiResult> {
  return collectGeminiFor(RETAILER_IDS);
}
