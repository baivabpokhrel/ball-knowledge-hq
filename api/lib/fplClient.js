/*
  Shared FPL API client used by every serverless route that talks to
  fantasy.premierleague.com. Centralised here for two reasons:

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

/*
  Fetches JSON from an FPL endpoint, retrying exactly once if FPL
  answers with 403 (blocked/bot-protection) or 429 (rate limited) -
  both are typically short-lived. Any other failure (timeout, 5xx,
  network error) is NOT retried, since retrying those just doubles
  the wait for something that isn't a brief blip.
*/
export async function getJson(url) {
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
  bootstrap-static/ is the one endpoint every route needs and none
  of them need up-to-the-second - teams/players/events barely change
  within a minute. Cached for the life of the warm serverless
  instance (this module-level variable survives between invocations
  on the same instance, and simply resets on a cold start), so a
  burst of requests across dashboard/fixtures/squads shares one FPL
  call instead of firing one each.
*/
const BOOTSTRAP_CACHE_MS = 60000;

let bootstrapCache = null; // { data, expiresAt }

export async function getBootstrap() {
  if (bootstrapCache && bootstrapCache.expiresAt > Date.now()) {
    return bootstrapCache.data;
  }

  const data = await getJson(`${FPL}/bootstrap-static/`);
  bootstrapCache = { data, expiresAt: Date.now() + BOOTSTRAP_CACHE_MS };
  return data;
}

/*
  Test-only escape hatch: the local test server swaps its mocked
  FPL responses between scenarios within the same process, which
  this cache has no other way to know about (a real cold start is
  what normally clears it). Never called from any route handler.
*/
export function _resetBootstrapCacheForTests() {
  bootstrapCache = null;
}

export { FPL, FPL_TIMEOUT_MS };
