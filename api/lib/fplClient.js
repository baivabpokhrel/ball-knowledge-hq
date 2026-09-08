/*
  Shared FPL API client used by every serverless route that talks to
  fantasy.premierleague.com. Centralised here for a few reasons:

  1. dashboard.js, fixtures.js, and squads.js were each independently
     re-fetching bootstrap-static/ (a multi-MB payload of every team,
     player, and Gameweek - it barely changes minute to minute) on
     every single request. Three routes x every page load/refresh/
     auto-poll adds up fast, and FPL has started intermittently
     answering with 403 under that load - confirmed in production:
     "Squads API error: Error: FPL returned 403", straight from the
     bootstrap-static call itself. A short in-memory cache, kept for
     the lifetime of the warm serverless instance, cuts that request
     volume dramatically without ever serving data more than a
     minute or so stale.

  2. A single automatic retry on 403/429 gives a transient rate-limit
     blip (as opposed to a real, sustained block) a second chance
     before giving up and showing an error - cheap insurance that
     costs nothing when FPL is healthy, and only adds one short delay
     when it isn't.

  3. Some routes now also need each manager's own entry/{id}/event/
     {gw}/picks/ just to read the Gameweek's transfer-cost hit (see
     dashboard.js) - a per-manager call that didn't exist before.
     getJson's optional `cacheMs` gives any call site the same kind
     of short shared cache as bootstrap-static, so a burst of nearly-
     simultaneous requests (several people opening the app at once,
     an auto-refresh) doesn't turn into a full fan-out of fresh FPL
     calls every time.
*/

const FPL = 'https://fantasy.premierleague.com/api';
const FPL_TIMEOUT_MS = 8000;

const RETRYABLE_STATUSES = new Set([403, 429]);
const RETRY_DELAY_MS = 600;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOnce(url) {
  let response;

  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'BallKnowledgeHQ/0.5',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(FPL_TIMEOUT_MS)
    });

  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('FPL is responding slowly right now - please try again.');
    }
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`FPL returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchWithRetry(url) {
  try {
    return await fetchOnce(url);

  } catch (error) {
    if (RETRYABLE_STATUSES.has(error.status)) {
      await wait(RETRY_DELAY_MS);
      return fetchOnce(url);
    }
    throw error;
  }
}

/*
  Generic short-lived cache, shared by every call site that opts in
  via `cacheMs`. Keyed on the exact URL, kept for the life of the
  warm serverless instance (resets on a cold start) - the same
  mechanism bootstrap-static used to use privately, now available to
  any endpoint that wants it.
*/
const sharedCache = new Map(); // url -> { data, expiresAt }

/*
  Fetches JSON from an FPL endpoint, retrying exactly once if FPL
  answers with 403 (blocked/bot-protection) or 429 (rate limited) -
  both are typically short-lived. Any other failure (timeout, 5xx,
  network error) is NOT retried, since retrying those just doubles
  the wait for something that isn't a brief blip.

  Pass `{ cacheMs }` to share the result across calls to this same
  URL for that many milliseconds - useful for anything that doesn't
  need to be fresh to the second (bootstrap-static, a manager's
  picks for an already-locked Gameweek). Omit it for anything that
  should always hit FPL fresh, such as event/{gw}/live/, which is
  exactly the endpoint that carries real-time points during play.
*/
export async function getJson(url, { cacheMs } = {}) {
  if (cacheMs) {
    const cached = sharedCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const data = await fetchWithRetry(url);

  if (cacheMs) {
    sharedCache.set(url, { data, expiresAt: Date.now() + cacheMs });
  }

  return data;
}

/*
  bootstrap-static/ is the one endpoint every route needs and none
  of them need up-to-the-second for its STATIC content (teams,
  player names/positions, etc.) - it barely changes minute to
  minute. It is NOT a reliable source for a player's live Gameweek
  points during a match (that field lags the dedicated event/{gw}/
  live/ feed - see api/squads.js and api/fixtures.js, which read
  live points from `live` instead), so this cache only ever affects
  static-ish data, never anything time-sensitive.
*/
const BOOTSTRAP_CACHE_MS = 60000;

export async function getBootstrap() {
  return getJson(`${FPL}/bootstrap-static/`, { cacheMs: BOOTSTRAP_CACHE_MS });
}

/*
  Test-only escape hatch: a local test server swapping its mocked
  FPL responses between scenarios within the same process has no
  other way to invalidate this (a real cold start is what normally
  clears it). Never called from any route handler.
*/
export function _resetBootstrapCacheForTests() {
  sharedCache.clear();
}

export { FPL, FPL_TIMEOUT_MS };
