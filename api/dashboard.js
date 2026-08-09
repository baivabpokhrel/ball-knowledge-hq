const FPL = 'https://fantasy.premierleague.com/api';

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BallKnowledgeHQ/0.5',
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
      await getJson(
        `${FPL}/bootstrap-static/`
      );


    let event =
      requestedGw
        ? bootstrap.events.find(
            e =>
              e.id === requestedGw
          )
        : null;


    event ||=
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

    const standings =
      await getJson(
        `${FPL}/leagues-classic/${leagueId}/standings/` +
        `?page_new_entries=1&page_standings=1&phase=1`
      );


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

    const detailed =
      await Promise.all(
        rows.map(
          async row => {
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
                  item =>
                    item.event === gw
                );


              if (current) {
                gameweekPoints =
                  current.points ??
                  gameweekPoints;

                seasonPoints =
                  current.total_points ??
                  seasonPoints;
              }

            } catch (error) {
              /*
                Expected before GW1
              */
              console.log(
                `No history for entry ${row.entry}`
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
