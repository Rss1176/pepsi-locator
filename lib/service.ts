import { scanAll } from './scan';
import { readSnapshot } from './store';
import type { Snapshot } from './types';

const HOUR_MS = 60 * 60 * 1000;

/** Guards the opt in on demand sweep so one warm instance cannot hammer retailers. */
let lastOnDemandScan = 0;

function shouldScanOnRequest(snapshot: Snapshot): boolean {
  if (process.env.SCAN_ON_REQUEST !== '1') return false;
  if (Date.now() - lastOnDemandScan < HOUR_MS) return false;

  const hasLive = snapshot.offers.some((offer) => offer.source === 'live');
  const age = Date.now() - Date.parse(snapshot.generatedAt);

  return !hasLive || !Number.isFinite(age) || age > 12 * HOUR_MS;
}

/**
 * Read the snapshot the page and the API both render from. With SCAN_ON_REQUEST
 * enabled, a deployment without durable storage can still gather live prices on
 * the first request rather than waiting for the next cron run.
 */
export async function loadAggregate(): Promise<{ snapshot: Snapshot }> {
  const snapshot = await readSnapshot();

  if (shouldScanOnRequest(snapshot)) {
    lastOnDemandScan = Date.now();
    try {
      const result = await scanAll();
      return { snapshot: result.snapshot };
    } catch {
      // A failed sweep must never take the page down; fall back to what we hold.
    }
  }

  return { snapshot };
}
