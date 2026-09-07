import type { RetailerId } from '../types';
import type { RetailerAdapter } from './base';
import { absoluteUrl, fetchHtml, type RequestOptions } from './http';
import { embeddedJson, harvest, jsonFromAttribute, productsFromJsonLd, type RawProduct } from './extract';

export interface HtmlAdapterConfig {
  id: RetailerId;
  origin: string;
  searchUrl: string;
  /** Hydration blobs to try, in order, when JSON-LD is absent. */
  stateMarkers?: string[];
  /** HTML attribute carrying a JSON payload, such as data-redux-state on Tesco. */
  stateAttribute?: string;
  headers?: Record<string, string>;
}

const NEXT_DATA = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

/**
 * Adapter for retailers that render their search results server side. Tries the
 * standards based route first, then the site specific hydration blobs.
 */
export function htmlSearchAdapter(config: HtmlAdapterConfig): RetailerAdapter {
  return {
    id: config.id,
    origin: config.origin,
    searchUrl: config.searchUrl,

    async collect(options: RequestOptions): Promise<RawProduct[]> {
      const html = await fetchHtml(config.searchUrl, { ...options, headers: config.headers });

      const candidates: RawProduct[] = productsFromJsonLd(html);

      if (candidates.length === 0) {
        const nextData = html.match(NEXT_DATA);
        if (nextData) {
          try {
            candidates.push(...harvest(JSON.parse(nextData[1])));
          } catch {
            // Ignore an unparsable payload and fall through to the other sources.
          }
        }
      }

      if (candidates.length === 0) {
        for (const marker of config.stateMarkers ?? []) {
          const state = embeddedJson(html, marker);
          if (state) {
            candidates.push(...harvest(state));
            break;
          }
        }
      }

      if (candidates.length === 0 && config.stateAttribute) {
        const state = jsonFromAttribute(html, config.stateAttribute);
        if (state) candidates.push(...harvest(state));
      }

      return candidates.map((product) => ({
        ...product,
        url: product.url ? absoluteUrl(config.origin, product.url) : config.searchUrl,
      }));
    },
  };
}
