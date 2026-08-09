const FPL = 'https://fantasy.premierleague.com/api';

async function getJson(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'BallKnowledgeHQ/0.3',
      Accept: 'application/json'
    }
  });

  if (!r.ok) {
    throw new Error(`FPL returned ${r.status} for ${url}`);
  }

  return r.json();
}

function eventStatus(event) {
  const now = new Date();
  const deadline = event?.deadline_time
    ? new Date(event.deadline_time)
    : null;

  // Before the Gameweek deadline
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

  // FPL has fully checked and finalized the GW
  if (event?.data_checked) {
    return {
      code: 'FINAL',
      label: 'Final after FPL checks',
      final: true
    };
  }

  // Matches finished but FPL is still processing
  if (event?.finished) {
    return {
      code: 'PROCESSING',
      label: 'Waiting for bonuses and corrections',
      final: false
    };
  }

  // Gameweek is underway
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

  const requestedGw = Number(req.query.gw || 0);

  if (!/^\d+$/.test(leagueId)) {
    return res.status(400).json({
      error: 'Numeric league ID required',
      needsLeagueId: true
    });
  }

  try {
    /*
      Get FPL gameweek information.
    */
    const bootstrap = await getJson(
      `${FPL}/bootstrap-static/`
    );

    let event = requestedGw
      ? bootstrap.events.find(
          (e) => e.id === requestedGw
        )
      : null;

    event ||=
      bootstrap.events.find((e) => e.is_current) ||
      bootstrap.events.find((e) => e.is_next) ||
      bootstrap.events.find((e) => e.is_previous) ||
      bootstrap.events[0];

    if (!event) {
      throw new Error(
        'Unable to determine the current FPL Gameweek.'
      );
    }

    const gw = event.id;

    /*
      Get the private league.

      page_new_entries=1 helps retrieve league entries/new members.
      phase=1 is the full-season phase.
    */
    const standingsUrl =
      `${FPL}/leagues-classic/${leagueId}/standings/` +
      `?page_new_entries=1&page_standings=1&phase=1`;

    const standings = await getJson(
      standingsUrl
    );

    /*
      Normal ranked entries.
    */
    const standingsRows =
      standings?.standings?.results || [];

    /*
      Before GW1, FPL may expose joined managers under
      new_entries instead of the ranked standings list.
    */
    const newEntryRows =
      standings?.new_entries?.results || [];

    /*
      Normalize both structures.

      After the season begins, standingsRows should be used.

      Before GW1, if standingsRows is empty, use new_entries
      so the site can at least show league members.
    */
    let rows = [];

    if (standingsRows.length > 0) {
      rows = standingsRows.map((row) => ({
        rank: row.rank,
        last_rank: row.last_rank,
        entry: row.entry,
        player_name: row.player_name,
        entry_name: row.entry_name,
        event_total: row.event_total ?? 0,
        total: row.total ?? 0,
        source: 'standings'
      }));
    } else if (newEntryRows.length > 0) {
      rows = newEntryRows.map((row, index) => ({
        rank: index + 1,
        last_rank: null,
        entry: row.entry,
        player_name:
          row.player_first_name ||
          row.player_name ||
          'Manager',
        entry_name:
          row.entry_name ||
          row.name ||
          'FPL Team',
        event_total: 0,
        total: 0,
        source: 'new_entries'
      }));
    }

    /*
      Pull each manager's actual GW history when available.
    */
    const detailed = await Promise.all(
      rows.map(async (row) => {
        let points =
          row.event_total ?? 0;

        let seasonPoints =
          row.total ?? 0;

        try {
          const history = await getJson(
            `${FPL}/entry/${row.entry}/history/`
          );

          const current =
            history.current?.find(
              (x) => x.event === gw
            );

          if (current) {
            points =
              current.points ?? points;

            seasonPoints =
              current.total_points ??
              seasonPoints;
          }
        } catch (error) {
          /*
            Before GW1 there may be no history yet.
            That is expected, so keep zeroes.
          */
          console.log(
            `No GW history yet for entry ${row.entry}`
          );
        }

        return {
          rank: row.rank,
          overallRank: row.rank,
          lastRank: row.last_rank,

          entryId: row.entry,

          manager:
            row.player_name ||
            'Manager',

          team:
            row.entry_name ||
            'FPL Team',

          gameweekPoints:
            points ?? 0,

          seasonPoints:
            seasonPoints ?? 0,

          movement:
            row.last_rank
              ? row.last_rank -
                row.rank
              : 0,

          source:
            row.source
        };
      })
    );

    /*
      Weekly standings.

      The winner of each Gameweek is determined ONLY
      by finalized Gameweek points.
    */
    const weekly = [
      ...detailed
    ].sort(
      (a, b) =>
        b.gameweekPoints -
          a.gameweekPoints ||
        a.manager.localeCompare(
          b.manager
        )
    );

    /*
      Overall season table.
    */
    const overall = [
      ...detailed
    ].sort(
      (a, b) =>
        b.seasonPoints -
          a.seasonPoints ||
        a.manager.localeCompare(
          b.manager
        )
    );

    const status =
      eventStatus(event);

    /*
      Don't call everyone a "provisional winner"
      before the Gameweek has actually begun.
    */
    const gameweekStarted =
      new Date() >=
      new Date(event.deadline_time);

    let provisionalLeader = [];
    let winners = [];
    let fraudOfTheWeek = [];

    if (
      gameweekStarted &&
      weekly.length > 0
    ) {
      const topScore =
        weekly[0].gameweekPoints;

      provisionalLeader =
        weekly.filter(
          (x) =>
            x.gameweekPoints ===
            topScore
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
            (x) =>
              x.gameweekPoints ===
              lowestScore
          );
      }
    }

    /*
      Useful connection metadata for the frontend.
    */
    const connection = {
      connected: true,
      leagueId,
      managerCount:
        detailed.length,
      source:
        standingsRows.length > 0
          ? 'FPL standings'
          : newEntryRows.length > 0
            ? 'FPL new entries'
            : 'FPL league found but no entries returned'
    };

    return res.status(200).json({
      connection,

      league: {
        id: leagueId,
        name:
          standings?.league?.name ||
          'Ball Knowledge Only'
      },

      gameweek: {
        id: gw,
        name: event.name,
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
  } catch (e) {
    console.error(
      'Dashboard error:',
      e
    );

    return res.status(502).json({
      connection: {
        connected: false,
        leagueId
      },

      error:
        e.message ||
        'Unable to connect to FPL.'
    });
  }
}
