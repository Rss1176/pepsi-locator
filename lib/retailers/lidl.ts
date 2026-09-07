import type { RetailerAdapter } from './base';

/**
 * Lidl GB runs no online grocery storefront, so there is no public price to read.
 * The adapter is declared so the retailer is reported honestly rather than omitted.
 */
export const lidl: RetailerAdapter = {
  id: 'lidl',
  origin: 'https://www.lidl.co.uk',
  searchUrl: 'https://www.lidl.co.uk/c/drinks/s10007288',
  unsupported: 'Lidl GB publishes no online grocery prices, so nothing can be read',
  async collect() {
    return [];
  },
};
