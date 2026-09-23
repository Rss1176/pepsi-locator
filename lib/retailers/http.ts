/** Shared HTTP plumbing for the retailer adapters. */

export class BlockedError extends Error {
  constructor(public readonly status: number) {
    super(`Retailer refused the request with HTTP ${status}`);
    this.name = 'BlockedError';
  }
}

/**
 * A full browser header set. The large grocers fingerprint requests, so a bare
 * user agent is refused outright; this will not defeat a determined bot check,
 * but it clears the simpler ones.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'en-GB,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

/** Navigation hints replaced with their XHR equivalents for API calls. */
const XHR_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/** Statuses the big grocers return when their bot protection turns a request away. */
const BLOCKING_STATUSES = new Set([401, 403, 405, 429, 503]);

async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: stripEmpty({ ...BROWSER_HEADERS, ...options.headers }),
      body: options.body,
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    });

    if (BLOCKING_STATUSES.has(response.status)) throw new BlockedError(response.status);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHtml(url: string, options: RequestOptions = {}): Promise<string> {
  const response = await request(url, {
    ...options,
    headers: { accept: 'text/html,application/xhtml+xml', ...options.headers },
  });
  return response.text();
}

export async function fetchJson<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(url, {
    ...options,
    // An API call must look like a page's own XHR, not like a navigation.
    headers: { ...XHR_HEADERS, ...options.headers },
  });
  return (await response.json()) as T;
}

/** Drop the navigation only hints that an XHR style request should not carry. */
function stripEmpty(headers: Record<string, string>): Record<string, string> {
  if (headers['sec-fetch-mode'] === 'cors') {
    const { 'sec-fetch-user': user, 'upgrade-insecure-requests': upgrade, ...rest } = headers;
    return rest;
  }
  return headers;
}

export function absoluteUrl(origin: string, path: string): string {
  try {
    return new URL(path, origin).toString();
  } catch {
    return origin;
  }
}
