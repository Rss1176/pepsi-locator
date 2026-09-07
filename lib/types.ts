/** The four pack formats the tracker follows. */
export type PackFormat = 'bottle' | 'pack-4' | 'pack-8' | 'pack-24';

export type RetailerId =
  | 'tesco'
  | 'asda'
  | 'sainsburys'
  | 'morrisons'
  | 'aldi'
  | 'lidl'
  | 'coop'
  | 'waitrose'
  | 'iceland'
  | 'ocado';

/** Where a price came from. Sample prices are seeded placeholders, never live readings. */
export type OfferSource = 'live' | 'sample';

export interface Offer {
  retailer: RetailerId;
  format: PackFormat;
  /** Product title exactly as the retailer publishes it. */
  title: string;
  /** Standard shelf price in pounds. */
  price: number;
  /** Loyalty scheme price in pounds, when the retailer publishes one. */
  loyaltyPrice?: number;
  /** Name of the scheme the loyalty price belongs to, for example Clubcard. */
  loyaltyScheme?: string;
  url: string;
  inStock: boolean;
  /** ISO timestamp of the reading. */
  capturedAt: string;
  source: OfferSource;
}

export type RetailerState = 'ok' | 'empty' | 'blocked' | 'error' | 'unsupported';

export interface RetailerStatus {
  retailer: RetailerId;
  state: RetailerState;
  offers: number;
  message?: string;
  durationMs: number;
  checkedAt: string;
}

export interface Snapshot {
  generatedAt: string;
  offers: Offer[];
  statuses: RetailerStatus[];
}

export interface FormatSummary {
  format: PackFormat;
  cheapest?: Offer;
  cheapestLoyalty?: Offer;
  offers: Offer[];
}

export interface Aggregate {
  generatedAt: string;
  summaries: Record<PackFormat, FormatSummary>;
  statuses: RetailerStatus[];
  liveOfferCount: number;
}
