import Script from 'next/script';

/**
 * Umami Cloud (decided 24/11/2026): cookieless audience measurement, so no consent banner is
 * needed as long as no other tracker is added. Rendered only when the website id is configured,
 * so local runs, tests and previews without the variable send nothing.
 */
export function Analytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;
  const src = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ?? 'https://cloud.umami.is/script.js';
  return <Script src={src} data-website-id={websiteId} strategy="afterInteractive" />;
}
