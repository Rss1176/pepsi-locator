import type { PackFormat } from './types';

const PEPSI_MAX = /pepsi\s*max/i;
const EXCLUDED = /(zero\s*sugar\s*cola\s*brand|diet\s*pepsi|pepsi\s*regular)/i;

/** True when a scraped product title is a Pepsi Max product rather than another cola. */
export function isPepsiMax(title: string): boolean {
  return PEPSI_MAX.test(title) && !EXCLUDED.test(title);
}

/**
 * Work out which of the four tracked formats a product title belongs to.
 * Returns null when the title is a Pepsi Max product we do not track,
 * for example a 6 pack or a 15 can fridge pack.
 */
export function detectFormat(title: string): PackFormat | null {
  const text = title.toLowerCase().replace(/\s+/g, ' ');

  // Multipacks written as "24 x 330ml" or "24x330 ml".
  const multipack = text.match(/(\d{1,2})\s*(?:x|×)\s*\d{2,4}\s*ml/);
  if (multipack) return packFromCount(Number(multipack[1]));

  // Multipacks written as "24 pack" or "pack of 24".
  const packOf = text.match(/(?:pack of\s*(\d{1,2}))|(?:(\d{1,2})\s*(?:can\s*)?pack)/);
  if (packOf) return packFromCount(Number(packOf[1] ?? packOf[2]));

  // Single bottles: 500ml, 600ml, 1L, 1.5L, 2L.
  if (/\b\d+(?:\.\d+)?\s*(?:l|litre|litres)\b/.test(text)) return 'bottle';
  if (/\b(?:500|600|750)\s*ml\b/.test(text) && !/(?:x|×)/.test(text)) return 'bottle';
  if (/\bbottle\b/.test(text) && !/(?:x|×)/.test(text)) return 'bottle';

  return null;
}

function packFromCount(count: number): PackFormat | null {
  if (count === 4) return 'pack-4';
  if (count === 8) return 'pack-8';
  if (count === 24) return 'pack-24';
  return null;
}

/**
 * Parse a price into pounds. Accepts numbers, "£1.75", "175p" and pence integers
 * such as 175 when the retailer publishes minor units.
 */
export function parsePrice(input: unknown, minorUnits = false): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const value = minorUnits ? input / 100 : input;
    return value > 0 ? round2(value) : null;
  }
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  const pence = trimmed.match(/^(\d{1,3})\s*p$/i);
  if (pence) return round2(Number(pence[1]) / 100);

  const pounds = trimmed.match(/(\d+(?:\.\d{1,2})?)/);
  if (!pounds) return null;
  const value = Number(pounds[1]);
  return Number.isFinite(value) && value > 0 ? round2(value) : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
