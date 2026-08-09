const FPL = 'https://fantasy.premierleague.com/api';

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BallKnowledgeHQ/0.4',
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `FPL returned ${response.status}`
    );
  }

  return response.json();
}

function eventStatus(event) {
  const now = new Date();

  const deadline = event?.deadline_time
    ? new Date(event.deadline_time)
    : null;

  // Before the gameweek starts
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

  // FPL has completed all checks
  if (event?.data_checked) {
    return {
      code: 'FINAL',
      label: 'Final after FPL checks',
      final: true
    };
  }

  // Matches finished but FPL may still update points
  if (event?.finished) {
    return {
      code: 'PROCESSING',
      label: 'Waiting for bonuses and corrections',
      final: false
    };
  }

  // Gameweek underway
  return {
    code: 'LIVE',
    label: 'Live / provisional points',
    final: false
  };
}

function fullManagerName(row) {
  /*
    During preseason FPL often gives:
    player_first_name
    player_last_name

    Once regular standings exist,
    player_name is normally available.
  */

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

export default async function handler(req, res) {
  const leagueId = String(
    req.query.leagueId ||
      process.env.FPL_LEAGUE_ID ||
      '92378'
  ).trim();

  const requestedGw =
    Number(req.query.gw || 0);

  if (!/^\d+$/.test(leagueId)) {
    return res.status(400).json({
      error:
        'Numeric league ID required',
      needsLeagueId: true
    });
  }

  try {
    /*
      ------------------------------------------------
      1. GET FPL GENERAL DATA
      ------------------------------------------------
    */

    const bootstrap =
      await getJson(
        `${FPL}/bootstrap-static/`
      );

    /*
      Work out which Gameweek we should display.
    */

    let event =
      requestedGw
        ? bootstrap.events.find(
            (e) =>
              e.id === requestedGw
          )
        : null;

    event ||=
      bootstrap.events.find(
        (e) => e.is_current
      ) ||
      bootstrap.events.find(
        (e) => e.is_next
      ) ||
      bootstrap.events.find(
        (e) => e.is_previous
      ) ||
      bootstrap.events[0];

    if (!event) {
      throw new Error(
        'Unable to determine current FPL Gameweek.'
      );
    }

    const gw = event.id;

    /*
      ------------------------------------------------
      2. GET PRIVATE LEAGUE DATA
      ------------------------------------------------
    */

    const standingsUrl =
      `${FPL}/leagues-classic/${leagueId}/standings/` +
      `?page_new_entries=1&page_standings=1&phase=1`;

    const standings =
      await getJson(
        standingsUrl
      );

    const standingsRows =
      standings?.standings?.results ||
      [];

    const newEntryRows =
      standings?.new_entries?.results ||
      [];

    /*
      ------------------------------------------------
      3. NORMALIZE LEAGUE MEMBERS
      ------------------------------------------------

      Before GW1:
      managers may appear under new_entries.

      After GW1:
      managers normally appear under standings.results.
    */

    let rows = [];

    if (
      standingsRows.length > 0
    ) {
      rows =
        standingsRows.map(
          (row) => ({
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
    } else if (
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

            /*
              FULL NAME FIX
            */
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
      ------------------------------------------------
      4. GET GAMEWEEK HISTORY FOR EACH MANAGER
      ------------------------------------------------
    */

    const detailed =
      await Promise.all(
        rows.map(
          async (row) => {
            let gameweekPoints =
              row.event_total ?? 0;

            let seasonPoints =
              row.total ?? 0;

            try {
              const history =
                await getJson(
                  `${FPL}/entry/${row.entry}/history/`
                );

              const current =
                history.current?.find(
                  (x) =>
                    x.event === gw
                );

              if (current) {
                /*
                  IMPORTANT:

                  current.points is the manager's
                  final/current GW total including
                  FPL scoring adjustments returned
                  by the API.
                */

                gameweekPoints =
                  current.points ??
                  gameweekPoints;

                seasonPoints =
                  current.total_points ??
                  seasonPoints;
              }
            } catch (error) {
              /*
                This can happen before GW1,
                because managers may not have
                Gameweek history yet.
              */

              console.log(
                `No history available for entry ${row.entry}`
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

              /*
                FULL MANAGER NAME
              */
              manager:
                row.player_name ||
                'Manager',

              /*
                TEAM NAME
              */
              team:
                row.entry_name ||
                'FPL Team',

              gameweekPoints,

              seasonPoints,

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
        )
      );

    /*
      ------------------------------------------------
      5. WEEKLY TABLE
      ------------------------------------------------

      This is separate from the overall FPL league.

      Highest Gameweek points wins.
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
      ------------------------------------------------
      6. OVERALL TABLE
      ------------------------------------------------
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
      ------------------------------------------------
      7. GAMEWEEK STATUS
      ------------------------------------------------
    */

    const status =
      eventStatus(event);

    const gameweekStarted =
      new Date() >=
      new Date(
        event.deadline_time
      );

    /*
      ------------------------------------------------
      8. WEEKLY AWARDS
      ------------------------------------------------
    */

    let provisionalLeader = [];
    let winners = [];
    let fraudOfTheWeek = [];

    /*
      Do NOT declare a leader before
      the Gameweek deadline.
    */

    if (
      gameweekStarted &&
      weekly.length > 0
    ) {
      const highestScore =
        weekly[0]
          .gameweekPoints;

      provisionalLeader =
        weekly.filter(
          (manager) =>
            manager.gameweekPoints ===
            highestScore
        );

      /*
        Only officially declare the winner
        after FPL data_checked becomes true.
      */

      if (status.final) {
        winners =
          provisionalLeader;

        const lowestScore =
          weekly[
            weekly.length - 1
          ].gameweekPoints;

        fraudOfTheWeek =
          weekly.filter(
            (manager) =>
              manager.gameweekPoints ===
              lowestScore
          );
      }
    }

    /*
      ------------------------------------------------
      9. CONNECTION INFORMATION
      ------------------------------------------------
    */

    const connection = {
      connected: true,

      leagueId,

      managerCount:
        detailed.length,

      source:
        standingsRows.length > 0
          ? 'FPL standings'
          : newEntryRows.length >
              0
            ? 'FPL new entries'
            : 'FPL league found but no managers returned'
    };

    /*
      ------------------------------------------------
      10. SEND DATA TO APP
      ------------------------------------------------
    */

    return res
      .status(200)
      .json({
        connection,

        league: {
          id: leagueId,

          name:
            standings?.league
              ?.name ||
            'Ball Knowledge Only'
        },

        gameweek: {
          id: gw,

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
          This is useful while testing
          because you can directly inspect
          every league member.
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

    return res
      .status(502)
      .json({
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
