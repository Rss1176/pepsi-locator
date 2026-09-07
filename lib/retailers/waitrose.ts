import type { RetailerAdapter } from './base';
import { absoluteUrl, fetchJson, type RequestOptions } from './http';
import { harvest, type RawProduct } from './extract';

const ORIGIN = 'https://www.waitrose.com';
const SEARCH = `${ORIGIN}/ecom/shop/search?&searchTerm=pepsi%20max`;
const API = `${ORIGIN}/api/content-prod/v2/cms/publish/productcontent/search/-1?clientType=WEB_APP`;

/** Waitrose serves its catalogue through a content API used by their own storefront. */
export const waitrose: RetailerAdapter = {
  id: 'waitrose',
  origin: ORIGIN,
  searchUrl: SEARCH,

  async collect(options: RequestOptions): Promise<RawProduct[]> {
    const payload = await fetchJson(API, {
      ...options,
      method: 'POST',
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

    return harvest(payload).map((product) => ({
      ...product,
      url: product.url ? absoluteUrl(ORIGIN, product.url) : SEARCH,
    }));
  },
};
