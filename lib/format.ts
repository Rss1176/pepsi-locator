const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function money(value: number): string {
  return GBP.format(value);
}

/** Split a price so the pounds can be rendered larger than the pence. */
export function moneyParts(value: number): { pounds: string; pence: string } {
  const fixed = value.toFixed(2);
  const [pounds, pence] = fixed.split('.');
  return { pounds: `£${pounds}`, pence };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;

  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function absoluteTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';
  return new Date(then).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}
