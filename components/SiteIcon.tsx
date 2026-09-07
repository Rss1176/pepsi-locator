'use client';

import { useState } from 'react';
import { googleIcon } from '@/lib/catalog';

interface SiteIconProps {
  domain: string;
  alt: string;
  size?: number;
  className?: string;
}

/**
 * Brand mark pulled from Google's favicon service. It needs no key and no
 * bundled logo; if the lookup fails the gradient placeholder takes its place.
 */
export default function SiteIcon({ domain, alt, size = 64, className }: SiteIconProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return <span className={`mark-fallback ${className ?? ''}`.trim()} aria-hidden="true" />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={googleIcon(domain, size)}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
