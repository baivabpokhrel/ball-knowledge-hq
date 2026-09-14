import { FPL, getJson, getBootstrap, mapWithConcurrency } from './lib/fplClient.js';
import { noCache } from './lib/http.js';
import { buildLiveContext, buildManagerSquad } from './lib/liveScoring.js';


function fullManagerName(row) {
  const firstName =
    row.player_first_name || '';

  const lastName =
    row.player_last_name || '';

  const combined =
    `${firstName} ${lastName}`.trim();

  return (
    combined ||
    row.player_name ||
    'Manager'
  );
}


function eventStatus(event) {
  const now = new Date();

  const deadline =
    event?.deadline_time
      ? new Date(event.deadline_time)
      : null;

  if (
    deadline &&
    now < deadline &&
    !event?.finished &&
    !event?.data_checked
  ) {
    return {
      code: 'PRE-SEASON',
      label: `Waiting for ${event.name}`,
      final: false
    };
  }

  if (event?.data_checked) {
    return {
      code: 'FINAL',
      label: 'Final after FPL checks',
      final: true
    };
  }

  if (event?.finished) {
    return {
      code: 'PROCESSING',
      label: 'Waiting for bonuses and corrections',
      final: false
    };
  }

  return {
    code: 'LIVE',
    label: 'Live / provisional points',
    final: false
  };
}


export default async function handler(req, res) {
  noCache(res);

  const leagueId = String(
    req.query.leagueId ||
      process.env.FPL_LEAGUE_ID ||
      '92378'
  ).trim();

  const requestedGw =
    Number(req.query.gw || 0);

  if (!/^\d+$/.test(leagueId)) {
    return res.status(400).json({
      error: 'Numeric league ID required'
    });
  }

  try {
    /*
      --------------------------------
      FPL GENERAL DATA
      --------------------------------
    */

    const bootstrap =
      await getBootstrap();


    /*
      FPL's own idea of "the current Gameweek", independent of
      whatever Gameweek was actually requested. Used below to
      decide whether we can trust the standings response as-is
      (fast path) or need to look up historical per-manager
      points (only possible/necessary for a past Gameweek).
    */

    const autoEvent =
      bootstrap.events.find(
        e => e.is_current
      ) ||
      bootstrap.events.find(
        e => e.is_next
      ) ||
      bootstrap.events.find(
        e => e.is_previous
      ) ||
      bootstrap.events[0];


    let event =
      requestedGw
        ? bootstrap.events.find(
            e =>
              e.id === requestedGw
          )
        : null;


    event ||=
      autoEvent;


    if (!event) {
      throw new Error(
        'Unable to determine current Gameweek.'
      );
    }


    const gw =
      event.id;


    /*
      --------------------------------
      PRIVATE LEAGUE
      --------------------------------
    */

    /*
      fixtures/live are fetched once per request here (not once per
      manager) purely to build the shared liveContext below - the
      same real-time-scoring context api/squads.js builds - so every
      manager's Gameweek points can be computed the same live way
      the Squad tab already does, instead of waiting on FPL's own
      slower-to-update per-manager aggregate. Both degrade gracefully
      to an empty/absent value on failure: liveContext still works,
      it just can't detect started/finished fixtures or live points,
      and callers fall back to the picks endpoint's own figures.
    */
    const [standings, fixtures, live] =
      await Promise.all([
        getJson(
          `${FPL}/leagues-classic/${leagueId}/standings/` +
          `?page_new_entries=1&page_standings=1&phase=1`
        ),
        getJson(`${FPL}/fixtures/?event=${gw}`).catch(() => []),
        getJson(`${FPL}/event/${gw}/live/`).catch(() => null)
      ]);

    const liveContext =
      buildLiveContext(bootstrap, fixtures, live, gw);


    const standingsRows =
      standings?.standings?.results ||
      [];


    const newEntryRows =
      standings?.new_entries?.results ||
      [];


    let rows = [];


    /*
      Normal season standings
    */

    if (
      standingsRows.length > 0
    ) {
      rows =
        standingsRows.map(
          row => ({
            rank:
              row.rank ?? null,

            last_rank:
              row.last_rank ??
              null,

            entry:
              row.entry,

            player_name:
              row.player_name ||
              fullManagerName(row),

            entry_name:
              row.entry_name ||
              'FPL Team',

            event_total:
              row.event_total ?? 0,

            total:
              row.total ?? 0,

            source:
              'standings'
          })
        );
    }

    /*
      Pre-season/new entries
    */

    else if (
      newEntryRows.length > 0
    ) {
      rows =
        newEntryRows.map(
          (row, index) => ({
            rank:
              index + 1,

            last_rank:
              null,

            entry:
              row.entry,

            player_name:
              fullManagerName(row),

            entry_name:
              row.entry_name ||
              row.name ||
              'FPL Team',

            event_total:
              0,

            total:
              0,

            source:
              'new_entries'
          })
        );
    }


    /*
      --------------------------------
      MANAGER DETAILS
      --------------------------------
    */

    /*
      Fetching every manager's picks at once (a single Promise.all
      over the whole league) turned out to be enough simultaneous
      load on FPL - on top of bootstrap-static and standings in the
      same request - to trip its rate limiting hard, even with the
      retries in fplClient. A handful at a time is gentler and still
      fast (a league this size finishes in 2-3 batches).
    */
    const MANAGER_FETCH_CONCURRENCY = 5;

    const detailed =
      await mapWithConcurrency(
        rows,
        MANAGER_FETCH_CONCURRENCY,
        async row => {
            /*
              Both fallbacks below (used before the deadline, or if
              FPL's picks endpoint fails for one manager) come from
              the league standings response - `event_total`, like
              `points` on the picks endpoint, is the RAW score
              before any transfer-cost hit, since that's all
              standings has to offer. It's only a fallback: the
              normal path below replaces it with the true net
              figure for every manager whose picks we can read.
            */
            let gameweekPoints =
              row.event_total ?? 0;

            let seasonPoints =
              row.total ?? 0;

            let eventTransfers = 0;
            let eventTransfersCost = 0;


            try {
              /*
                entry/{id}/event/{gw}/picks/ is the one place that
                carries BOTH this Gameweek's raw points AND the
                transfer-cost hit that applies to them, for any
                Gameweek (live or past) whose deadline has passed.
                Cached briefly since this now runs for every manager
                on every dashboard load, including the live/current
                Gameweek (previously read straight from standings,
                for free) - the cache keeps a burst of page loads
                from turning into a full per-manager fan-out to FPL
                each time.
              */
              const picks =
                await getJson(
                  `${FPL}/entry/${row.entry}/event/${gw}/picks/`,
                  { cacheMs: 20000 }
                );

              const squad =
                buildManagerSquad(picks, liveContext);

              eventTransfers =
                squad.transfers;

              eventTransfersCost =
                squad.transferCost;

              /*
                Once FPL has fully data-checked this Gameweek
                (liveContext.gwDataChecked), its own entry_history.
                points is the guaranteed-final word - it can reflect
                late stat corrections this app's own live computation
                can't see - so prefer squad.actualPoints (already net
                of the transfer-cost hit, see liveScoring.js). Until
                then, entry_history.points lags well behind what's
                actually happening on the pitch (FPL only recomputes
                it periodically, not on every live score change), so
                use squad.predictedTotal instead - the SAME live
                total, built fresh from event/{gw}/live/ every
                request, that the Squad tab already shows. This is
                what makes the GW Standings table (and the total
                shown at the top of a manager's own Squad tab, which
                also reads manager.gameweekPoints) track live scoring
                as fast as the Squad tab's own per-player list does.
              */
              gameweekPoints =
                liveContext.gwDataChecked
                  ? (squad.actualPoints ?? squad.predictedTotal)
                  : squad.predictedTotal;

              seasonPoints =
                picks.entry_history?.total_points ??
                seasonPoints;

            } catch (error) {
              /*
                Expected before this Gameweek's deadline has passed
                (picks aren't published yet) - falls back to the
                standings figure above, same as always.
              */
              console.log(
                `No picks for entry ${row.entry}, GW ${gw}: ${error.message}`
              );
            }


            return {
              rank:
                row.rank,

              overallRank:
                row.rank,

              lastRank:
                row.last_rank,

              entryId:
                row.entry,

              manager:
                row.player_name ||
                'Manager',

              team:
                row.entry_name ||
                'FPL Team',

              gameweekPoints,

              seasonPoints,

              eventTransfers,

              eventTransfersCost,

              movement:
                row.last_rank &&
                row.rank
                  ? row.last_rank -
                    row.rank
                  : 0,

              source:
                row.source
            };
        }
      );


    /*
      --------------------------------
      WEEKLY
      --------------------------------
    */

    const weekly =
      [...detailed].sort(
        (a, b) =>
          b.gameweekPoints -
            a.gameweekPoints ||
          a.team.localeCompare(
            b.team
          )
      );


    /*
      --------------------------------
      OVERALL
      --------------------------------
    */

    const overall =
      [...detailed].sort(
        (a, b) =>
          b.seasonPoints -
            a.seasonPoints ||
          a.team.localeCompare(
            b.team
          )
      );


    /*
      --------------------------------
      STATUS / AWARDS
      --------------------------------
    */

    const status =
      eventStatus(event);


    const gameweekStarted =
      new Date() >=
      new Date(
        event.deadline_time
      );


    let provisionalLeader = [];
    let winners = [];
    let fraudOfTheWeek = [];


    if (
      gameweekStarted &&
      weekly.length > 0
    ) {
      const highestScore =
        weekly[0].gameweekPoints;


      provisionalLeader =
        weekly.filter(
          manager =>
            manager.gameweekPoints ===
            highestScore
        );


      if (status.final) {
        winners =
          provisionalLeader;


        const lowestScore =
          weekly[
            weekly.length - 1
          ].gameweekPoints;


        fraudOfTheWeek =
          weekly.filter(
            manager =>
              manager.gameweekPoints ===
              lowestScore
          );
      }
    }


    /*
      --------------------------------
      RESPONSE
      --------------------------------
    */

    return res.status(200).json({

      connection: {
        connected: true,

        leagueId,

        managerCount:
          detailed.length,

        source:
          standingsRows.length > 0
            ? 'FPL standings'
            : newEntryRows.length > 0
              ? 'FPL new entries'
              : 'No managers returned'
      },


      league: {
        id:
          leagueId,

        name:
          standings?.league?.name ||
          'Ball Knowledge Only'
      },


      gameweek: {
        id:
          gw,

        name:
          event.name,

        deadline:
          event.deadline_time,

        finished:
          !!event.finished,

        dataChecked:
          !!event.data_checked,

        status
      },


      updatedAt:
        new Date().toISOString(),


      /*
        CRITICAL FOR ADMIN PAGE
      */

      managers:
        detailed,


      weekly,

      overall,


      awards: {
        winners,

        managerOfTheWeek:
          status.final
            ? winners
            : [],

        provisionalLeader,

        fraudOfTheWeek
      }

    });

  } catch (error) {
    console.error(
      'Dashboard error:',
      error
    );


    return res.status(502).json({

      connection: {
        connected: false,

        leagueId
      },

      error:
        error.message ||
        'Unable to connect to FPL.'

    });
  }
}
