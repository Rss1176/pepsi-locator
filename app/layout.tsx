import type { Metadata, Viewport } from 'next';
import SiteIcon from '@/components/SiteIcon';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pepsi Max Price Tracker',
  description:
    'The cheapest Pepsi Max across ten UK supermarkets, filtered by bottle, 4 pack, 8 pack and 24 pack.',
  openGraph: {
    title: 'Pepsi Max Price Tracker',
    description: 'The cheapest Pepsi Max across ten UK supermarkets, refreshed on a schedule.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <header className="chrome">
          <div className="shell chrome-inner">
            <span className="wordmark">
              <SiteIcon domain="pepsi.co.uk" alt="Pepsi Max" size={128} />
              Pepsi Max Price Tracker
            </span>
            <span className="chrome-meta">United Kingdom</span>
          </div>
        </header>

        <main className="shell">{children}</main>

        <footer className="footer">
          <div className="shell">
            <p>
              Prices are read from each retailer&apos;s public website and can be out of date or wrong.
              Always check the shop before buying. Loyalty prices need the relevant card.
            </p>
            <p>
              Pepsi Max is a trademark of PepsiCo. This is an independent price tracker with no
              affiliation to PepsiCo or to any retailer listed. Retailer marks are served by Google&apos;s
              favicon service for identification only.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
