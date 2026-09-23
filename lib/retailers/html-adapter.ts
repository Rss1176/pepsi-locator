import type { RetailerId } from '../types';
import type { RetailerAdapter } from './base';
import { absoluteUrl, fetchHtml, type RequestOptions } from './http';
import {
  embeddedJson,
  harvest,
  jsonFromAttribute,
  jsonLdBlocks,
  productsFromJsonLd,
  type RawProduct,
} from './extract';

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

    /**
     * Report which extraction route the page supports and show the markup
     * around any Pepsi mention, so a parser returning nothing can be fixed
     * against the real page instead of guesswork.
     */
    async probe(options: RequestOptions): Promise<Record<string, unknown>> {
      const html = await fetchHtml(config.searchUrl, { ...options, headers: config.headers });

      const markers: Record<string, boolean> = {};
      for (const marker of config.stateMarkers ?? []) {
        markers[marker] = embeddedJson(html, marker) !== null;
      }

      const nextData = html.match(NEXT_DATA);
      let nextDataCandidates = 0;
      if (nextData) {
        try {
          nextDataCandidates = harvest(JSON.parse(nextData[1])).length;
        } catch {
          nextDataCandidates = -1;
        }
      }

      return {
        url: config.searchUrl,
        bytes: html.length,
        title: html.match(/<title[^>]*>([\s\S]{0,120}?)<\/title>/i)?.[1]?.trim(),
        jsonLdBlocks: jsonLdBlocks(html).length,
        jsonLdProducts: productsFromJsonLd(html).length,
        nextDataPresent: Boolean(nextData),
        nextDataCandidates,
        stateMarkers: markers,
        stateAttribute: config.stateAttribute
          ? jsonFromAttribute(html, config.stateAttribute) !== null
          : undefined,
        pepsiMentions: (html.match(/pepsi/gi) ?? []).length,
        pepsiSnippets: snippets(html, /pepsi/i, 3, 260),
      };
    },
  };
}

/** A few short windows of markup around a pattern, for reading page shape. */
function snippets(html: string, pattern: RegExp, count: number, width: number): string[] {
  const found: string[] = [];
  const global = new RegExp(pattern.source, 'gi');

  for (const match of html.matchAll(global)) {
    if (found.length >= count) break;
    const start = Math.max(0, (match.index ?? 0) - width / 2);
    found.push(html.slice(start, start + width).replace(/\s+/g, ' '));
  }

  return found;
}
