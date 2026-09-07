import type { RetailerAdapter } from './base';
import { absoluteUrl, fetchJson, type RequestOptions } from './http';
import type { RawProduct } from './extract';

const ORIGIN = 'https://www.sainsburys.co.uk';
const SEARCH = `${ORIGIN}/gol-ui/SearchResults/pepsi%20max`;
const API = `${ORIGIN}/groceries-api/gol-services/product/v1/product?filter%5Bkeyword%5D=pepsi%20max&page_size=60`;

interface SainsburysProduct {
  name?: string;
  full_url?: string;
  is_available?: boolean;
  retail_price?: { price?: number };
  nectar_price?: { retail_price?: number };
}

/** Sainsbury's publishes a JSON product service behind its search page. */
export const sainsburys: RetailerAdapter = {
  id: 'sainsburys',
  origin: ORIGIN,
  searchUrl: SEARCH,

  async collect(options: RequestOptions): Promise<RawProduct[]> {
    const payload = await fetchJson<{ products?: SainsburysProduct[] }>(API, options);

    return (payload.products ?? []).map((product) => ({
      title: product.name ?? '',
      price: product.retail_price?.price,
      loyaltyPrice: product.nectar_price?.retail_price,
      url: product.full_url ? absoluteUrl(ORIGIN, product.full_url) : SEARCH,
      inStock: product.is_available,
    }));
  },
};
