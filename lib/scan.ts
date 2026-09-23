import { ADAPTERS } from './retailers';
import { runAdapter } from './retailers/base';
import { collectTrolley } from './sources/trolley';
import { mergeOffers, readSnapshot, writeSnapshot } from './store';
import type { Offer, RetailerStatus, Snapshot, SourceStatus } from './types';

/** Per retailer budget. Adapters run concurrently inside the function timeout. */
const ADAPTER_TIMEOUT_MS = 12_000;

export interface ScanResult {
  snapshot: Snapshot;
  statuses: RetailerStatus[];
  sources: SourceStatus[];
  found: number;
}

/** Read the comparison site that covers several retailers in one request. */
async function runTrolley(): Promise<{ offers: Offer[]; status: SourceStatus }> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  const status = (state: SourceStatus['state'], offers: number, message?: string): SourceStatus => ({
    id: 'trolley',
    label: 'Trolley',
    state,
    offers,
    message,
    durationMs: Date.now() - startedAt,
    checkedAt,
  });

  try {
    const offers = await collectTrolley({ timeoutMs: ADAPTER_TIMEOUT_MS });
    return offers.length > 0
      ? { offers, status: status('ok', offers.length) }
      : { offers, status: status('empty', 0, 'Reached the site but found no tracked Pepsi Max format') };
  } catch (error) {
    return { offers: [], status: status('error', 0, error instanceof Error ? error.message : 'Unknown error') };
  }
}

/**
 * Sweep every retailer and the comparison site, merge the readings into the
 * stored snapshot and persist it. A shop's own price wins over the same price
 * read through a comparison site, since it is first hand.
 */
export async function scanAll(): Promise<ScanResult> {
  const previous = await readSnapshot();

  const [runs, trolley] = await Promise.all([
    Promise.all(ADAPTERS.map((adapter) => runAdapter(adapter, ADAPTER_TIMEOUT_MS))),
    runTrolley(),
  ]);

  const direct: Offer[] = runs.flatMap((run) => run.offers);
  const statuses: RetailerStatus[] = runs.map((run) => run.status);

  // Aggregator first so a first hand reading replaces it on the same key.
  const found = [...trolley.offers, ...direct];

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    offers: mergeOffers(previous.offers, found),
    statuses,
    sources: [trolley.status],
  };

  await writeSnapshot(snapshot);

  return { snapshot, statuses, sources: [trolley.status], found: found.length };
}
