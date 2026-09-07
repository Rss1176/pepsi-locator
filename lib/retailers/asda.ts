import type { RetailerAdapter } from './base';
import { fetchJson, type RequestOptions } from './http';
import { harvest, type RawProduct } from './extract';
import { htmlSearchAdapter } from './html-adapter';

const ORIGIN = 'https://groceries.asda.com';
const SEARCH = `${ORIGIN}/search/pepsi%20max`;
const API = `${ORIGIN}/api/items/search?keyword=pepsi%20max&storeid=4565&page=1`;

const htmlFallback = htmlSearchAdapter({
  id: 'asda',
  origin: ORIGIN,
  searchUrl: SEARCH,
  stateMarkers: ['window.__PRELOADED_STATE__', 'window.__APOLLO_STATE__'],
});

/** Asda exposes a search API; the rendered page is the fallback when it moves. */
export const asda: RetailerAdapter = {
  id: 'asda',
  origin: ORIGIN,
  searchUrl: SEARCH,

  async collect(options: RequestOptions): Promise<RawProduct[]> {
    try {
      const payload = await fetchJson(API, options);
      const products = harvest(payload);
      if (products.length > 0) return products;
    } catch {
      // Fall through to the rendered search page.
    }

    return htmlFallback.collect(options);
  },
};
