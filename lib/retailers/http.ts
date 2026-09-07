/** Shared HTTP plumbing for the retailer adapters. */

export class BlockedError extends Error {
  constructor(public readonly status: number) {
    super(`Retailer refused the request with HTTP ${status}`);
    this.name = 'BlockedError';
  }
}

const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'accept-language': 'en-GB,en;q=0.9',
  'cache-control': 'no-cache',
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
      headers: { ...BROWSER_HEADERS, ...options.headers },
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
    headers: { accept: 'application/json', ...options.headers },
  });
  return (await response.json()) as T;
}

export function absoluteUrl(origin: string, path: string): string {
  try {
    return new URL(path, origin).toString();
  } catch {
    return origin;
  }
}
