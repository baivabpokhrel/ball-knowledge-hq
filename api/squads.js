import { FPL, getJson, getBootstrap, mapWithConcurrency } from './_lib/fplClient.js';
import { noCache } from './_lib/http.js';
import { buildLiveContext, buildManagerSquad } from './_lib/liveScoring.js';

/*
  ===================================================
  HANDLER

  GET /api/squads?gw=<gw>&entries=<id,id,id>

  Returns each manager's picks for that Gameweek
  (captain, vice-captain, chip, starting XI, bench)
  plus a blended live/predicted-points figure per
  manager: for any player whose real-life match has
  already kicked off, we use their actual live points
  (FPL's own "event_points", which updates in real time
  during play); for a player who hasn't played yet, we
  fall back to FPL's own "ep_this" (expected points).
  That means the total updates itself as the Gameweek
  goes on - all-projected before kickoff, a mix during
  play, and all-actual once every fixture is finished.

  Also applies FPL's own automatic-substitution and
  captain/vice-captain fallback rules, using each
  player's real Gameweek minutes from event/{gw}/live/.
  This per-manager scoring logic (auto-subs, captaincy
  fallback, the live-vs-projected blend) is shared with
  api/dashboard.js via api/_lib/liveScoring.js, so both
  routes always agree on "what does this manager's
  Gameweek look like right now" - see that file for why
  that sharing matters.

  Only meaningful for a Gameweek whose deadline has
  already passed - FPL's picks endpoint hides other
  managers' teams until then, so callers should not
  request a not-yet-locked Gameweek.
  ===================================================
*/

export default async function handler(req, res) {
  noCache(res);

  const gw = Number(req.query.gw || 0);

  const entryIds = String(req.query.entries || '')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value > 0);

  if (!Number.isInteger(gw) || gw < 1 || gw > 38) {
    return res.status(400).json({ error: 'Invalid Gameweek' });
  }

  if (!entryIds.length) {
    return res.status(400).json({ error: 'No entries provided' });
  }

  try {
    const [bootstrap, fixtures, live] = await Promise.all([
      getBootstrap(),
      getJson(`${FPL}/fixtures/?event=${gw}`).catch(() => []),
      // Only used for real per-Gameweek minutes (auto-subs/
      // captain fallback) - degrade gracefully without it.
      getJson(`${FPL}/event/${gw}/live/`).catch(() => null)
    ]);

    const liveContext = buildLiveContext(bootstrap, fixtures, live, gw);

    /*
      Same reasoning as dashboard.js: firing every manager's picks
      fetch at once, on top of bootstrap/fixtures/live in the same
      request, is enough simultaneous FPL load to trip rate limiting
      - a handful at a time is gentler and barely slower.
    */
    const ENTRY_FETCH_CONCURRENCY = 5;

    const squads = await mapWithConcurrency(
      entryIds,
      ENTRY_FETCH_CONCURRENCY,
      async entryId => {
        try {
          const picksData = await getJson(
            `${FPL}/entry/${entryId}/event/${gw}/picks/`
          );

          const squad = buildManagerSquad(picksData, liveContext);

          return { entryId, error: null, ...squad };

        } catch (error) {
          return {
            entryId,
            error:
              error.message ||
              'Unable to load this squad'
          };
        }
      }
    );

    return res.status(200).json({
      gw,
      squads,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Squads API error:', error);

    return res.status(502).json({
      error:
        error.message ||
        'Unable to connect to FPL.'
    });
  }
}
