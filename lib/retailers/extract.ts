/**
 * Parsing helpers shared by the HTML adapters. Grocery sites publish their
 * catalogue in one of three shapes: JSON-LD product blocks, a hydration blob
 * assigned to a window property, or plain markup. These helpers cover the
 * first two, which are the only stable ones.
 */

export interface RawProduct {
  title: string;
  price: unknown;
  loyaltyPrice?: unknown;
  url?: string;
  inStock?: boolean;
}

/** Every JSON-LD block on a page, parsed and flattened through @graph. */
export function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      const parsed: unknown = JSON.parse(match[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        const graph = (node as { '@graph'?: unknown })['@graph'];
        if (Array.isArray(graph)) blocks.push(...graph);
        else blocks.push(node);
      }
    } catch {
      // A malformed block is normal on large retail pages. Skip it.
    }
  }

  return blocks;
}

/** Products described by schema.org markup, including those nested in an ItemList. */
export function productsFromJsonLd(html: string): RawProduct[] {
  const products: RawProduct[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;

    const type = record['@type'];
    const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')];

    if (types.includes('ItemList')) {
      const elements = record.itemListElement;
      if (Array.isArray(elements)) {
        for (const element of elements) {
          const item = (element as Record<string, unknown>)?.item ?? element;
          visit(item);
        }
      }
      return;
    }

    if (!types.includes('Product')) return;

    const name = typeof record.name === 'string' ? record.name : null;
    if (!name) return;

    const offers = Array.isArray(record.offers) ? record.offers[0] : record.offers;
    const offer = (offers ?? {}) as Record<string, unknown>;

    products.push({
      title: name,
      price: offer.price ?? offer.lowPrice ?? record.price,
      url: typeof record.url === 'string' ? record.url : typeof offer.url === 'string' ? offer.url : undefined,
      inStock: typeof offer.availability === 'string' ? !/OutOfStock/i.test(offer.availability) : undefined,
    });
  };

  for (const block of jsonLdBlocks(html)) visit(block);
  return products;
}

/**
 * Pull a hydration blob such as window.__PRELOADED_STATE__ = {...}; by walking
 * braces so nested objects and strings containing braces stay intact.
 */
export function embeddedJson(html: string, marker: string): unknown | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const start = html.indexOf('{', markerIndex + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/** Depth first search for every object carrying the given keys. */
export function collectNodes(root: unknown, requiredKeys: string[], limit = 400): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const queue: unknown[] = [root];
  let visited = 0;

  while (queue.length > 0 && found.length < limit && visited < 200_000) {
    const node = queue.shift();
    visited += 1;
    if (!node || typeof node !== 'object') continue;

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    const record = node as Record<string, unknown>;
    if (requiredKeys.every((key) => key in record)) found.push(record);
    queue.push(...Object.values(record));
  }

  return found;
}

const TITLE_KEYS = ['name', 'title', 'productTitle', 'item_name', 'displayName', 'productName'];
const PRICE_KEYS = [
  'price',
  'retail_price',
  'currentPrice',
  'salePrice',
  'nowPrice',
  'priceInfo',
  'price_info',
  'currentSellingPrice',
  'displayPrice',
];
const LOYALTY_KEYS = ['nectar_price', 'clubcardPrice', 'loyaltyPrice', 'memberPrice', 'rewardPrice', 'promotionPrice'];
const URL_KEYS = ['url', 'full_url', 'href', 'link', 'productUrl', 'seo_url', 'canonicalUrl', 'slug'];
const VALUE_KEYS = ['price', 'value', 'amount', 'retail_price', 'now', 'current', 'unit_price', 'formattedValue'];

/** Reduce a nested price object such as { price_info: { price: "£8.00" } } to a scalar. */
function scalarPrice(value: unknown, depth = 0): unknown {
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (depth >= 3 || !value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const record = value as Record<string, unknown>;
  for (const key of VALUE_KEYS) {
    if (key in record) {
      const resolved = scalarPrice(record[key], depth + 1);
      if (resolved !== undefined) return resolved;
    }
  }
  return undefined;
}

function firstKey(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (key in record) return record[key];
  return undefined;
}

/**
 * Generic sweep over a hydration blob for anything that looks like a product.
 * Grocery hydration shapes change often, so matching on key names rather than
 * on a fixed path keeps the adapters working across redesigns.
 */
export function harvest(root: unknown, limit = 600): RawProduct[] {
  const products: RawProduct[] = [];
  const queue: unknown[] = [root];
  let visited = 0;

  while (queue.length > 0 && products.length < limit && visited < 200_000) {
    const node = queue.shift();
    visited += 1;
    if (!node || typeof node !== 'object') continue;

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    const record = node as Record<string, unknown>;
    queue.push(...Object.values(record));

    const title = firstKey(record, TITLE_KEYS);
    if (typeof title !== 'string' || title.length < 3 || title.length > 200) continue;

    const price = scalarPrice(firstKey(record, PRICE_KEYS));
    if (price === undefined) continue;

    const url = firstKey(record, URL_KEYS);

    products.push({
      title,
      price,
      loyaltyPrice: scalarPrice(firstKey(record, LOYALTY_KEYS)),
      url: typeof url === 'string' ? url : undefined,
      inStock: typeof record.is_available === 'boolean' ? record.is_available : undefined,
    });
  }

  return products;
}

/** Decode an HTML attribute that carries a JSON payload, such as data-redux-state. */
export function jsonFromAttribute(html: string, attribute: string): unknown | null {
  const match = html.match(new RegExp(`${attribute}="([^"]+)"`));
  if (!match) return null;

  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
