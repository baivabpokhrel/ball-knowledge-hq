/*
  Every route that reflects live-changing FPL data (dashboard,
  squads, fixtures, analytics) needs to disable caching at every
  layer between FPL and the browser - not just our own in-app
  fplClient cache, which is short and deliberate, but any CDN/edge
  cache Vercel or an intermediary might otherwise apply on top of
  it. Three headers cover the different layers: Cache-Control for
  browsers and generic proxies, CDN-Cache-Control for third-party
  CDNs in front of Vercel, and Vercel-CDN-Cache-Control for Vercel's
  own Edge Network specifically (this is the one that actually
  matters here - it takes precedence over any static header rule in
  vercel.json for the same route). api/payments.js already used this
  exact pattern; this just makes it reusable.
*/
export function noCache(res) {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  res.setHeader(
    'CDN-Cache-Control',
    'no-store'
  );

  res.setHeader(
    'Vercel-CDN-Cache-Control',
    'no-store'
  );
}
