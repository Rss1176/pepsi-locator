import { ADAPTERS } from './retailers';
import { runAdapter } from './retailers/base';
import {
  collectGeminiFor,
  DEFAULT_TARGETS,
  isConfigured as geminiConfigured,
  MAX_TARGETS,
} from './sources/gemini';
import { collectTrolley } from './sources/trolley';
import { mergeOffers, readSnapshot, writeSnapshot } from './store';
import type { Offer, RetailerId, RetailerStatus, Snapshot, SourceStatus } from './types';

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
 * Grounded search costs money per call, so it is pointed at the retailers that
 * failed last time rather than at all ten. With no previous sweep to learn
 * from it starts with the ones known to refuse direct requests.
 */
export function geminiTargets(previous: Snapshot): RetailerId[] {
  // No sweep has run yet, so start with the retailers known to refuse us.
  if (previous.statuses.length === 0) return DEFAULT_TARGETS.slice(0, MAX_TARGETS);

  return previous.statuses
    .filter((status) => status.state !== 'ok' && status.state !== 'unsupported')
    .map((status) => status.retailer)
    .slice(0, MAX_TARGETS);
}

/** Ask Gemini, with Google Search grounding, for prices it can cite. */
async function runGemini(targets: RetailerId[]): Promise<{ offers: Offer[]; status: SourceStatus }> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  const status = (state: SourceStatus['state'], offers: number, message?: string): SourceStatus => ({
    id: 'gemini',
    label: 'Gemini search',
    state,
    offers,
    message,
    durationMs: Date.now() - startedAt,
    checkedAt,
  });

  if (!geminiConfigured()) {
    return { offers: [], status: status('unsupported', 0, 'Set GEMINI_API_KEY to enable grounded search') };
  }

  try {
    const result = await collectGeminiFor(targets);
    const asked = `asked ${result.asked.length} via ${result.model}`;
    const note =
      result.rejected.length > 0 ? `${asked}, ${result.rejected.length} claims rejected` : asked;

    return result.offers.length > 0
      ? { offers: result.offers, status: status('ok', result.offers.length, note) }
      : { offers: [], status: status('empty', 0, `No citable price returned, ${note}`) };
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

  const [runs, trolley, gemini] = await Promise.all([
    Promise.all(ADAPTERS.map((adapter) => runAdapter(adapter, ADAPTER_TIMEOUT_MS))),
    runTrolley(),
    runGemini(geminiTargets(previous)),
  ]);

  const direct: Offer[] = runs.flatMap((run) => run.offers);
  const statuses: RetailerStatus[] = runs.map((run) => run.status);

  // Least direct first, so a first hand reading replaces it on the same key.
  const found = [...gemini.offers, ...trolley.offers, ...direct];

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    offers: mergeOffers(previous.offers, found),
    statuses,
    sources: [trolley.status, gemini.status],
  };

  await writeSnapshot(snapshot);

  return { snapshot, statuses, sources: snapshot.sources ?? [], found: found.length };
}
