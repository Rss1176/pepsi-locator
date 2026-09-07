import seed from '../data/snapshot.json';
import type { Offer, Snapshot } from './types';

const KEY = 'pepsi-locator:snapshot';

/**
 * The seeded snapshot ships with the repository so a fresh deployment renders
 * immediately. Every seeded offer is marked as a sample rather than a reading.
 */
export const SEED_SNAPSHOT = seed as Snapshot;

/** Survives between invocations on a warm serverless instance. */
let memory: Snapshot | null = null;

interface KvConfig {
  url: string;
  token: string;
}

/** Vercel KV and Upstash Redis both expose this REST pair. Optional. */
function kvConfig(): KvConfig | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

async function kvRead(config: KvConfig): Promise<Snapshot | null> {
  try {
    const response = await fetch(`${config.url}/get/${encodeURIComponent(KEY)}`, {
      headers: { authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { result?: string | null };
    return payload.result ? (JSON.parse(payload.result) as Snapshot) : null;
  } catch {
    return null;
  }
}

async function kvWrite(config: KvConfig, snapshot: Snapshot): Promise<void> {
  await fetch(`${config.url}/set/${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(snapshot),
    cache: 'no-store',
  });
}

export function isPersistent(): boolean {
  return kvConfig() !== null;
}

/** Latest snapshot: durable storage when configured, then warm memory, then the seed. */
export async function readSnapshot(): Promise<Snapshot> {
  const config = kvConfig();
  if (config) {
    const stored = await kvRead(config);
    if (stored) {
      memory = stored;
      return stored;
    }
  }

  return memory ?? SEED_SNAPSHOT;
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  memory = snapshot;
  const config = kvConfig();
  if (config) await kvWrite(config, snapshot);
}

/**
 * Merge a sweep into the previous snapshot. Live readings replace anything held
 * for the same retailer and format; seeded samples are kept only where a
 * retailer has never returned a live reading, so gaps stay visible.
 */
export function mergeOffers(previous: Offer[], incoming: Offer[]): Offer[] {
  const merged = new Map<string, Offer>();
  const sweptRetailers = new Set(incoming.map((offer) => offer.retailer));

  for (const offer of previous) {
    // Drop stale live readings for a retailer that has just been swept.
    if (offer.source === 'live' && sweptRetailers.has(offer.retailer)) continue;
    merged.set(`${offer.retailer}:${offer.format}`, offer);
  }

  for (const offer of incoming) merged.set(`${offer.retailer}:${offer.format}`, offer);

  return [...merged.values()].sort((a, b) => a.price - b.price);
}
