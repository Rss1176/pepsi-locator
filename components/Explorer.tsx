'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import FormatPicker from './FormatPicker';
import SiteIcon from './SiteIcon';
import { DEFAULT_FORMAT, formatMeta, retailerMeta } from '@/lib/catalog';
import { absoluteTime, money, moneyParts, relativeTime } from '@/lib/format';
import type { Aggregate, Offer, PackFormat, RetailerStatus } from '@/lib/types';

export type PriceFeed = Aggregate & { offers: Offer[] };

const STATE_COPY: Record<RetailerStatus['state'], string> = {
  ok: 'Read successfully',
  empty: 'No tracked format found',
  blocked: 'Blocked by the retailer',
  error: 'Could not be read',
  unsupported: 'No online prices published',
};

export default function Explorer({ initial }: { initial: PriceFeed }) {
  const [feed, setFeed] = useState<PriceFeed>(initial);
  const [format, setFormat] = useState<PackFormat>(DEFAULT_FORMAT);
  const [checking, setChecking] = useState(false);
  const [freshness, setFreshness] = useState<string | null>(null);

  // Relative time is resolved after mount so the server and client markup agree.
  useEffect(() => setFreshness(relativeTime(feed.generatedAt)), [feed.generatedAt]);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/prices', { cache: 'no-store' });
      if (response.ok) setFeed((await response.json()) as PriceFeed);
    } catch {
      // Keep showing the prices already on screen.
    } finally {
      setChecking(false);
    }
  }, []);

  const meta = formatMeta(format);
  const summary = feed.summaries[format];
  const best = summary?.cheapest;
  const loyaltyBest = summary?.cheapestLoyalty;
  const rows = summary?.offers ?? [];

  const hasSample = useMemo(() => rows.some((offer) => offer.source === 'sample'), [rows]);
  const updated = freshness ?? absoluteTime(feed.generatedAt);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">UK supermarket sweep</p>
        <h1 className="headline">The cheapest Pepsi Max, tracked for you.</h1>
        <p className="subhead">
          Ten grocers checked on a schedule. Pick a format and see who is cheapest right now.
        </p>
        <FormatPicker value={format} onChange={setFormat} />
      </section>

      <section className="stage" aria-live="polite">
        <div className="stage-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={meta.id} src={meta.image} alt={`Pepsi Max ${meta.name}`} width={640} height={640} />
        </div>

        <div>
          <p className="stage-label">
            {meta.name}
            <span className={`badge ${best?.source === 'live' ? 'badge-live' : 'badge-sample'}`}>
              {best?.source === 'live' ? 'Live' : 'Sample'}
            </span>
          </p>

          {best ? (
            <>
              <p className="price">
                <span className="price-pounds">{moneyParts(best.price).pounds}</span>
                <span className="price-pence">.{moneyParts(best.price).pence}</span>
              </p>
              <p className="price-retailer">{retailerMeta(best.retailer).name}</p>
              <p className="price-title">{best.title}</p>

              {loyaltyBest?.loyaltyPrice !== undefined && (
                <p className="loyalty">
                  <strong>{money(loyaltyBest.loyaltyPrice)}</strong>
                  with {loyaltyBest.loyaltyScheme ?? 'a loyalty card'} at{' '}
                  {retailerMeta(loyaltyBest.retailer).name}
                </p>
              )}

              <div className="cta-row">
                <a className="button" href={best.url} target="_blank" rel="noreferrer noopener">
                  View at {retailerMeta(best.retailer).name}
                </a>
                <button type="button" className="button button-quiet" onClick={check} disabled={checking}>
                  {checking ? 'Checking' : 'Check for updates'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="price">
                <span className="price-pounds">No price</span>
              </p>
              <p className="price-title">
                Nothing has been read for this format yet. Run a sweep to gather prices.
              </p>
              <div className="cta-row">
                <button type="button" className="button" onClick={check} disabled={checking}>
                  {checking ? 'Checking' : 'Check for updates'}
                </button>
              </div>
            </>
          )}

          <p className="section-note" style={{ marginTop: 18 }}>
            Updated {updated} · {feed.liveOfferCount} live {feed.liveOfferCount === 1 ? 'price' : 'prices'} held
          </p>
        </div>
      </section>

      {hasSample && (
        <p className="notice">
          <strong>Some prices below are seeded samples.</strong> They ship with the repository so the page
          is never empty, and they are not readings from a shop. Anything marked Live came from that
          retailer&apos;s own site during the last sweep.
        </p>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Every retailer, {meta.name.toLowerCase()}</h2>
          <span className="section-note">{meta.detail}</span>
        </div>

        {rows.length > 0 ? (
          <ul className="list">
            {rows.map((offer) => {
              const retailer = retailerMeta(offer.retailer);
              return (
                <li className="row" key={`${offer.retailer}-${offer.format}`}>
                  <SiteIcon domain={retailer.domain} alt="" className="row-icon" />
                  <div>
                    <p className="row-name">
                      {retailer.name}
                      <span className={`badge ${offer.source === 'live' ? 'badge-live' : 'badge-sample'}`}>
                        {offer.source === 'live' ? 'Live' : 'Sample'}
                      </span>
                    </p>
                    <p className="row-sub">
                      <a href={offer.url} target="_blank" rel="noreferrer noopener">
                        {offer.title}
                      </a>
                    </p>
                  </div>
                  <div className="row-right">
                    <span className="row-price">{money(offer.price)}</span>
                    {offer.loyaltyPrice !== undefined && (
                      <span className="row-loyalty">
                        {money(offer.loyaltyPrice)} with {offer.loyaltyScheme ?? 'loyalty'}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notice">No retailer is currently holding a price for this format.</p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Last sweep</h2>
          <span className="section-note">
            {feed.statuses.length > 0 ? `Checked ${updated}` : 'No sweep has run on this deployment yet'}
          </span>
        </div>

        {feed.statuses.length > 0 ? (
          <ul className="list">
            {feed.statuses.map((status) => {
              const retailer = retailerMeta(status.retailer);
              return (
                <li className={`row ${status.state === 'ok' ? '' : 'row-muted'}`} key={status.retailer}>
                  <SiteIcon domain={retailer.domain} alt="" className="row-icon" />
                  <div>
                    <p className="row-name">{retailer.name}</p>
                    <p className="row-sub">{status.message ?? STATE_COPY[status.state]}</p>
                  </div>
                  <div className="row-right">
                    <span className="row-price">{status.offers}</span>
                    <span className="row-sub">{status.offers === 1 ? 'price' : 'prices'}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notice">
            The scheduled sweep runs daily on Vercel Cron. Call <strong>/api/refresh</strong> to run one now.
          </p>
        )}
      </section>
    </>
  );
}
