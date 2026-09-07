import type { PackFormat, RetailerId } from './types';

export interface FormatMeta {
  id: PackFormat;
  /** Short label used by the segmented control. */
  label: string;
  /** Full name used in headings and metadata. */
  name: string;
  detail: string;
  image: string;
}

export const DEFAULT_FORMAT: PackFormat = 'pack-24';

export const FORMATS: FormatMeta[] = [
  {
    id: 'bottle',
    label: 'Bottle',
    name: 'Bottle',
    detail: 'Single plastic bottle, 500ml through 2 litre',
    image: '/products/bottle.png',
  },
  {
    id: 'pack-4',
    label: '4 pack',
    name: '4 pack',
    detail: 'Four 330ml cans',
    image: '/products/pack-4.png',
  },
  {
    id: 'pack-8',
    label: '8 pack',
    name: '8 pack',
    detail: 'Eight 330ml cans',
    image: '/products/pack-8.png',
  },
  {
    id: 'pack-24',
    label: '24 pack',
    name: '24 pack',
    detail: 'Twenty four 330ml cans',
    image: '/products/pack-24.png',
  },
];

export const FORMAT_IDS: PackFormat[] = FORMATS.map((format) => format.id);

export function formatMeta(id: PackFormat): FormatMeta {
  const meta = FORMATS.find((entry) => entry.id === id);
  if (!meta) throw new Error(`Unknown pack format: ${id}`);
  return meta;
}

export interface RetailerMeta {
  id: RetailerId;
  name: string;
  /** Domain used for the Google favicon lookup and for outbound links. */
  domain: string;
  loyaltyScheme?: string;
}

export const RETAILERS: Record<RetailerId, RetailerMeta> = {
  tesco: { id: 'tesco', name: 'Tesco', domain: 'tesco.com', loyaltyScheme: 'Clubcard' },
  asda: { id: 'asda', name: 'Asda', domain: 'asda.com', loyaltyScheme: 'Asda Rewards' },
  sainsburys: { id: 'sainsburys', name: "Sainsbury's", domain: 'sainsburys.co.uk', loyaltyScheme: 'Nectar' },
  morrisons: { id: 'morrisons', name: 'Morrisons', domain: 'morrisons.com', loyaltyScheme: 'More Card' },
  aldi: { id: 'aldi', name: 'Aldi', domain: 'aldi.co.uk' },
  lidl: { id: 'lidl', name: 'Lidl', domain: 'lidl.co.uk', loyaltyScheme: 'Lidl Plus' },
  coop: { id: 'coop', name: 'Co-op', domain: 'coop.co.uk', loyaltyScheme: 'Co-op Membership' },
  waitrose: { id: 'waitrose', name: 'Waitrose', domain: 'waitrose.com', loyaltyScheme: 'myWaitrose' },
  iceland: { id: 'iceland', name: 'Iceland', domain: 'iceland.co.uk', loyaltyScheme: 'Bonus Card' },
  ocado: { id: 'ocado', name: 'Ocado', domain: 'ocado.com' },
};

export const RETAILER_IDS = Object.keys(RETAILERS) as RetailerId[];

export function retailerMeta(id: RetailerId): RetailerMeta {
  return RETAILERS[id];
}

/** Google favicon endpoint, used for retailer marks and the Pepsi Max brand mark. */
export function googleIcon(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
