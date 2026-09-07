import { FORMAT_IDS } from './catalog';
import type { Aggregate, FormatSummary, Offer, PackFormat, Snapshot } from './types';

function cheapestBy(offers: Offer[], value: (offer: Offer) => number | undefined): Offer | undefined {
  let best: Offer | undefined;
  let bestValue = Number.POSITIVE_INFINITY;

  for (const offer of offers) {
    const candidate = value(offer);
    if (candidate === undefined) continue;

    // A live reading always beats a seeded sample at the same price.
    const isBetter =
      candidate < bestValue || (candidate === bestValue && offer.source === 'live' && best?.source !== 'live');

    if (isBetter) {
      best = offer;
      bestValue = candidate;
    }
  }

  return best;
}

export function summarise(offers: Offer[], format: PackFormat): FormatSummary {
  const forFormat = offers
    .filter((offer) => offer.format === format && offer.inStock)
    .sort((a, b) => a.price - b.price);

  return {
    format,
    offers: forFormat,
    cheapest: cheapestBy(forFormat, (offer) => offer.price),
    cheapestLoyalty: cheapestBy(forFormat, (offer) => offer.loyaltyPrice),
  };
}

export function aggregate(snapshot: Snapshot): Aggregate {
  const summaries = {} as Record<PackFormat, FormatSummary>;
  for (const format of FORMAT_IDS) summaries[format] = summarise(snapshot.offers, format);

  return {
    generatedAt: snapshot.generatedAt,
    summaries,
    statuses: snapshot.statuses,
    liveOfferCount: snapshot.offers.filter((offer) => offer.source === 'live').length,
  };
}
