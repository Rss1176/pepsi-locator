import { ADAPTERS } from './retailers';
import { runAdapter } from './retailers/base';
import { mergeOffers, readSnapshot, writeSnapshot } from './store';
import type { Offer, RetailerStatus, Snapshot } from './types';

/** Per retailer budget. Ten adapters run concurrently inside the function timeout. */
const ADAPTER_TIMEOUT_MS = 12_000;

export interface ScanResult {
  snapshot: Snapshot;
  statuses: RetailerStatus[];
  found: number;
}

/** Sweep every retailer, merge the readings into the stored snapshot and persist it. */
export async function scanAll(): Promise<ScanResult> {
  const previous = await readSnapshot();

  const runs = await Promise.all(ADAPTERS.map((adapter) => runAdapter(adapter, ADAPTER_TIMEOUT_MS)));

  const found: Offer[] = runs.flatMap((run) => run.offers);
  const statuses: RetailerStatus[] = runs.map((run) => run.status);

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    offers: mergeOffers(previous.offers, found),
    statuses,
  };

  await writeSnapshot(snapshot);

  return { snapshot, statuses, found: found.length };
}
