import type { RetailerId } from '../types';
import type { RetailerAdapter } from './base';
import { aldi } from './aldi';
import { asda } from './asda';
import { coop } from './coop';
import { iceland } from './iceland';
import { lidl } from './lidl';
import { morrisons } from './morrisons';
import { ocado } from './ocado';
import { sainsburys } from './sainsburys';
import { tesco } from './tesco';
import { waitrose } from './waitrose';

/** Every retailer the tracker sweeps. Add an adapter here to widen coverage. */
export const ADAPTERS: RetailerAdapter[] = [
  tesco,
  asda,
  sainsburys,
  morrisons,
  aldi,
  lidl,
  coop,
  waitrose,
  iceland,
  ocado,
];

export function adapterFor(id: RetailerId): RetailerAdapter | undefined {
  return ADAPTERS.find((adapter) => adapter.id === id);
}

export type { RetailerAdapter } from './base';
