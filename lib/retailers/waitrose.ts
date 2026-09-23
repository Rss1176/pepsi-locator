import type { RetailerAdapter } from './base';
import { absoluteUrl, fetchJson, type RequestOptions } from './http';
import { harvest, type RawProduct } from './extract';
import { htmlSearchAdapter } from './html-adapter';

const ORIGIN = 'https://www.waitrose.com';
const SEARCH = `${ORIGIN}/ecom/shop/search?&searchTerm=pepsi%20max`;
const API = `${ORIGIN}/api/content-prod/v2/cms/publish/productcontent/search/-1?clientType=WEB_APP`;

/** The API call has been seen to hang, so it gets a short budget of its own. */
const API_TIMEOUT_MS = 6_000;

const htmlFallback = htmlSearchAdapter({
  id: 'waitrose',
  origin: ORIGIN,
  searchUrl: SEARCH,
  stateMarkers: ['window.__PRELOADED_STATE__', 'window.__INITIAL_STATE__'],
});

/** Waitrose serves its catalogue through a content API used by their storefront. */
export const waitrose: RetailerAdapter = {
  id: 'waitrose',
  origin: ORIGIN,
  searchUrl: SEARCH,

  async collect(options: RequestOptions): Promise<RawProduct[]> {
    try {
      const payload = await fetchJson(API, {
        ...options,
        method: 'POST',
        timeoutMs: Math.min(options.timeoutMs ?? API_TIMEOUT_MS, API_TIMEOUT_MS),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerSearchRequest: {
            queryParams: {
              searchTerm: 'pepsi max',
              sortBy: 'RELEVANCE',
              searchTags: [],
              filterTags: [],
              orderId: '0',
              size: 60,
            },
          },
        }),
      });

      const products = harvest(payload);
      if (products.length > 0) {
        return products.map((product) => ({
          ...product,
          url: product.url ? absoluteUrl(ORIGIN, product.url) : SEARCH,
        }));
      }
    } catch {
      // Fall through to the rendered search page.
    }

    return htmlFallback.collect(options);
  },

  probe(options: RequestOptions) {
    return htmlFallback.probe!(options);
  },
};
