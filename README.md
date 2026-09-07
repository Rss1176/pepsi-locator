# Pepsi Locator

A price tracker for Pepsi Max across UK supermarkets. It sweeps ten grocers on a
schedule, works out the cheapest price for each pack format, and shows the result
on a single page. The 24 pack is the default view.

Built with Next.js 15, TypeScript and React 19. Deployable to Vercel with no
external services required.

## What it does

- Filters by bottle, 4 pack, 8 pack and 24 pack, each with its own artwork.
- Sweeps Tesco, Asda, Sainsbury's, Morrisons, Aldi, Lidl, Co-op, Waitrose,
  Iceland and Ocado.
- Shows loyalty prices such as Clubcard and Nectar as a separate figure, never
  blended into the headline price.
- Reports the outcome of every retailer sweep, including the ones that failed,
  so a missing price is visible rather than silent.
- Labels every price as Live or Sample. Nothing seeded is ever presented as a
  reading from a shop.

## Honest limits

The four large grocers sit behind bot protection. A plain server side fetch from
a Vercel IP is often refused, and the sweep reports that refusal rather than
inventing a number. Expect some retailers to return prices and others to report
`blocked` on any given run. Lidl GB publishes no online grocery prices at all,
so it is declared unsupported.

The repository ships with `data/snapshot.json`, a seeded set of plausible prices
so a fresh deployment is never blank. Every one of those entries is marked
`"source": "sample"` and rendered with a Sample badge. They were not read from a
shop and should not be treated as real.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To run a sweep locally:

```bash
curl http://localhost:3000/api/refresh
```

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import it at vercel.com. The framework preset is detected automatically and
   no build settings need changing.
3. Deploy.

`vercel.json` registers a daily cron that calls `/api/refresh` at 06:00 UTC,
which is within the once a day limit of the Hobby plan.

### Environment variables

All optional. Copy `.env.example` for reference.

| Variable | Purpose |
| --- | --- |
| `CRON_SECRET` | Protects `/api/refresh`. Vercel Cron sends it as a bearer token automatically. Without it the route is open, which suits local development. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV or Upstash Redis. Makes swept prices durable across serverless instances. |
| `SCAN_ON_REQUEST` | Set to `1` to let a page request trigger a sweep when the stored snapshot holds no live prices or is over twelve hours old. At most one sweep per instance per hour. |

Without KV, swept prices live only in the memory of a warm instance, so the page
usually falls back to the seeded snapshot. Adding a KV store is the single
change that makes the tracker behave like a real one across deployments.

## How it works

```
app/                 Next.js App Router pages and API routes
  api/prices         Current cheapest prices per format, as JSON
  api/refresh        Runs a sweep. Called by Vercel Cron
components/          Client components: segmented control, price stage, lists
lib/
  retailers/         One adapter per grocer, plus shared HTTP and parsing
  aggregate.ts       Cheapest standard price and cheapest loyalty price
  match.ts           Title to pack format matching and price parsing
  scan.ts            Runs every adapter concurrently and merges the results
  store.ts           Snapshot storage: KV, warm memory, then the seeded file
data/snapshot.json   Seeded sample prices
public/products/     Generated PNG and SVG artwork
scripts/             Artwork generator
```

A sweep runs all ten adapters concurrently with a twelve second budget each.
Live readings replace anything held for the same retailer and format; a seeded
sample is kept only where that retailer has never returned a live reading.

### Adding a retailer

1. Create `lib/retailers/<name>.ts`. For a server rendered site, call
   `htmlSearchAdapter` with the search URL. For a site with a JSON API, implement
   `collect` and return raw title and price pairs.
2. Add the id to `RetailerId` in `lib/types.ts` and an entry in `RETAILERS` in
   `lib/catalog.ts`.
3. Register the adapter in `lib/retailers/index.ts`.

Matching and price parsing are handled centrally, so an adapter only has to
return titles and prices.

### Artwork

`npm run images` redraws the bottle, 4 pack, 8 pack and 24 pack as vectors and
rasterises them to 1024px PNGs in `public/products`. The artwork is an original
illustration in the Pepsi Max palette, so no retailer photography is
redistributed. Brand marks in the interface come from Google's favicon service,
which needs no API key, with a gradient placeholder if a lookup fails.

## Legal

Prices are read from public retailer websites and can be wrong or out of date.
Always check the shop before buying. Loyalty prices require the relevant card.

Pepsi Max is a trademark of PepsiCo. This is an independent price tracker with no
affiliation to PepsiCo or to any retailer listed. Retailer marks are used for
identification only.
