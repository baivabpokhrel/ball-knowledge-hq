import { FPL, getJson, getBootstrap } from './lib/fplClient.js';

/*
  ===================================================
  HANDLER

  GET /api/fixtures?gw=<gw>

  Real-world Premier League fixtures/results for one
  Gameweek - kickoff time, teams, and (once a match has
  kicked off) the live or final score, plus per-match
  detail once there's anything to show:

    - events: who scored/assisted/was booked/etc, resolved
      from FPL's own per-fixture "stats" breakdown (real
      match data, not a fantasy projection).
    - lineups: best-effort "who actually featured" per side,
      derived from event/{gw}/live/ once the match has
      kicked off, each carrying that player's FPL points for
      the Gameweek (the same figure shown elsewhere in the
      app) so the lineup doubles as a quick "who actually
      delivered" view. FPL's API has no pre-match team-news
      feed, so there is no way to show an official lineup
      "confirmed ~60 minutes before kickoff" - this instead
      becomes available from kickoff onward, which is the
      real data FPL's API actually exposes.
    - homeCrest/awayCrest: official club badge URLs, built
      from each team's own FPL "code" (stable across seasons)
      against the Premier League's own badge CDN - no external
      API/key needed, so this always resolves once a team has
      that field.
  ===================================================
*/

export default async function handler(req, res) {
  const gw = Number(req.query.gw || 0);

  if (!Number.isInteger(gw) || gw < 1 || gw > 38) {
    return res.status(400).json({ error: 'Invalid Gameweek' });
  }

  try {
    const [bootstrap, fixtures, live] = await Promise.all([
      getBootstrap(),
      getJson(`${FPL}/fixtures/?event=${gw}`),
      // Only exists to build lineups - degrade gracefully
      // (no lineups, everything else unaffected) if it fails.
      getJson(`${FPL}/event/${gw}/live/`).catch(() => null)
    ]);

    const teamsById = new Map(
      (bootstrap.teams || []).map(team => [team.id, team])
    );

    const elementsById = new Map(
      (bootstrap.elements || []).map(element => [element.id, element])
    );

    const typesById = new Map(
      (bootstrap.element_types || []).map(type => [type.id, type])
    );

    const liveById = new Map(
      (live?.elements || []).map(entry => [entry.id, entry])
    );

    /*
      The Premier League's own badge CDN, keyed by each team's
      "code" field (a fixed per-club id that's stable across
      seasons, unlike "id" which is just 1-20 for the current
      season) - the same URL pattern the official FPL site itself
      uses for team badges, so no external API or key is needed.
    */
    function crestFor(fplTeamId) {
      const team = teamsById.get(fplTeamId);

      return team?.code
        ? `https://resources.premierleague.com/premierleague/badges/70/t${team.code}.png`
        : null;
    }

    function playerLabel(elementId) {
      const element = elementsById.get(elementId);
      const type = element ? typesById.get(element.element_type) : null;

      return {
        id: elementId,
        name: element?.web_name || 'Unknown',
        position: type?.singular_name_short || ''
      };
    }

    /*
      One fixture's raw "stats" array (goals_scored, assists,
      own_goals, penalties_saved, penalties_missed,
      yellow_cards, red_cards, saves, bonus,
      defensive_contribution) turned into readable per-player
      lists, resolved to names and tagged with which side
      ('h'/'a') they're on.
    */
    function eventsFor(fixture, status) {

      const byIdentifier = new Map(
        (fixture.stats || []).map(stat => [stat.identifier, stat])
      );

      function listFor(identifier) {
        const stat = byIdentifier.get(identifier);

        if (!stat) {
          return [];
        }

        const home = (stat.h || []).map(entry => ({
          ...playerLabel(entry.element),
          team: 'h',
          value: entry.value
        }));

        const away = (stat.a || []).map(entry => ({
          ...playerLabel(entry.element),
          team: 'a',
          value: entry.value
        }));

        return [...home, ...away];
      }

      return {
        scorers: listFor('goals_scored'),
        assists: listFor('assists'),
        ownGoals: listFor('own_goals'),
        yellowCards: listFor('yellow_cards'),
        redCards: listFor('red_cards'),
        penaltiesMissed: listFor('penalties_missed'),
        penaltiesSaved: listFor('penalties_saved'),
        saves: listFor('saves'),
        defensiveContributions: listFor('defensive_contribution'),
        bonus: listFor('bonus'),
        // Bonus (and BPS-derived stats) can still move until
        // FPL fully data-checks the Gameweek - flag whether
        // what's shown is provisional or the final word.
        bonusFinal: status === 'final'
      };

    }

    /*
      Best-effort "who actually featured" per side, derived
      from event/{gw}/live/'s per-player explain data (each
      entry ties to a specific real fixture id) rather than
      any pre-match lineup feed, which FPL's API doesn't
      provide. "started" uses that player's Gameweek-level
      starts flag, which is only ambiguous in the rare case
      their team plays twice in the same Gameweek. Each player
      carries their own FPL "points" for the Gameweek (the raw,
      un-captained figure - the same one shown on the Squad
      tab) so this view doubles as "who actually delivered",
      not just "who was on the pitch".
    */
    function lineupFor(fixture) {

      if (!live || !fixture.started) {
        return null;
      }

      function teamLineup(teamId) {
        return (bootstrap.elements || [])
          .filter(element => element.team === teamId)
          .map(element => {
            const liveEntry = liveById.get(element.id);
            const explain = liveEntry?.explain || [];

            const matchExplain = explain.find(
              entry => entry.fixture === fixture.id
            );

            if (!matchExplain) {
              return null;
            }

            /*
              FPL ties EVERY named-squad player to the fixture
              via an explain entry, including an unused substitute
              who never left the bench (0 minutes, 0 of everything)
              - so "has an explain entry" alone is NOT the same as
              "actually played", which was making the whole bench
              show up as "substitutes used". Real involvement means
              minutes played in THIS fixture specifically (the
              per-fixture value, not the Gameweek-level total, so a
              double-Gameweek player's other match doesn't leak in
              here).
            */

            const minutesStat = (matchExplain.stats || []).find(
              stat => stat.identifier === 'minutes'
            );

            const minutesPlayed = Number(minutesStat?.value || 0);

            if (minutesPlayed <= 0) {
              return null;
            }

            const startsStat = (matchExplain.stats || []).find(
              stat => stat.identifier === 'starts'
            );

            const started =
              startsStat
                ? Number(startsStat.value || 0) > 0
                : (liveEntry?.stats?.starts ?? 0) > 0;

            const type = typesById.get(element.element_type);

            /*
              live/'s own stats.total_points is FPL's real-time
              scoring feed - it updates noticeably faster during a
              match than bootstrap-static's mirrored event_points,
              which is only used here as a fallback.
            */
            const points =
              liveEntry?.stats?.total_points != null
                ? Number(liveEntry.stats.total_points)
                : Number(element.event_points || 0);

            return {
              id: element.id,
              name: element.web_name,
              position: type?.singular_name_short || '',
              started,
              points
            };
          })
          .filter(Boolean)
          .sort((a, b) => Number(b.started) - Number(a.started));
      }

      return {
        home: teamLineup(fixture.team_h),
        away: teamLineup(fixture.team_a)
      };

    }

    const rows = (Array.isArray(fixtures) ? fixtures : [])
      .slice()
      .sort(
        (a, b) =>
          new Date(a.kickoff_time || 0) -
          new Date(b.kickoff_time || 0)
      )
      .map(fixture => {
        const home = teamsById.get(fixture.team_h);
        const away = teamsById.get(fixture.team_a);

        const status =
          fixture.finished || fixture.finished_provisional
            ? 'final'
            : fixture.started
              ? 'live'
              : 'upcoming';

        return {
          id: fixture.id,
          kickoff: fixture.kickoff_time || null,
          homeTeam: home?.short_name || '???',
          awayTeam: away?.short_name || '???',
          homeTeamName: home?.name || '',
          awayTeamName: away?.name || '',
          homeCrest: crestFor(fixture.team_h),
          awayCrest: crestFor(fixture.team_a),
          homeScore:
            status === 'upcoming'
              ? null
              : fixture.team_h_score ?? 0,
          awayScore:
            status === 'upcoming'
              ? null
              : fixture.team_a_score ?? 0,
          status,
          events:
            status === 'upcoming'
              ? null
              : eventsFor(fixture, status),
          lineups: lineupFor(fixture)
        };
      });

    return res.status(200).json({
      gw,
      fixtures: rows,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Fixtures API error:', error);

    return res.status(502).json({
      error: error.message || 'Unable to connect to FPL.'
    });
  }
}
