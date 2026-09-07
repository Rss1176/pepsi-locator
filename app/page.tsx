import Explorer, { type PriceFeed } from '@/components/Explorer';
import { aggregate } from '@/lib/aggregate';
import { loadAggregate } from '@/lib/service';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { snapshot } = await loadAggregate();
  const feed: PriceFeed = { ...aggregate(snapshot), offers: snapshot.offers };

  return <Explorer initial={feed} />;
}
