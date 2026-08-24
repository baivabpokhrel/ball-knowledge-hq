import {
  apiFootballConfigured,
  getApiFootballTeamMap,
  enrichFixtureFromApiFootball
} from './lib/apiFootball.js';

const FPL = 'https://fantasy.premierleague.com/api';

/*
  Same reasoning as the other API routes: FPL's API gets slow/
  rate-limited under load, so every outbound call gets a timeout
  rather than risking Vercel killing the whole function.
*/
const FPL_TIMEOUT_MS = 8000;

async function getJson(url) {
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
    throw new Error(`FPL returned ${response.status}`);
  }

  return response.json();
}

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
      match data, not a fantasy projection). events.enriched
      carries the same information with real minutes and
      real substitution pairing (who came off for whom) when
      API_FOOTBALL_KEY is configured - see api/lib/
      apiFootball.js - and is null otherwise, in which case
      the frontend falls back to the aggregate-only fields.
    - lineups: best-effort "who actually featured" per side,
      derived from event/{gw}/live/ once the match has
      kicked off. FPL's API has no pre-match team-news feed,
      so there is no way to show an official lineup
      "confirmed ~60 minutes before kickoff" - this instead
      becomes available from kickoff onward, which is the
      real data FPL's API actually exposes.
    - homeCrest/awayCrest: club logo URLs from api-football
      when configured, null otherwise (the frontend falls
      back to a plain text badge).
  ===================================================
*/

export default async function handler(req, res) {
  const gw = Number(req.query.gw || 0);

  if (!Number.isInteger(gw) || gw < 1 || gw > 38) {
    return res.status(400).json({ error: 'Invalid Gameweek' });
  }

  try {
    const [bootstrap, fixtures, live] = await Promise.all([
      getJson(`${FPL}/bootstrap-static/`),
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
      Season start year (2025 for the 2025/26 season) - GW1's
      deadline always falls in August, so its year IS the season's
      start year, no month-adjustment needed. Only used to query
      api-football, which is entirely optional (see lib/apiFootball.js).
    */
    const season = bootstrap.events?.[0]?.deadline_time
      ? new Date(bootstrap.events[0].deadline_time).getUTCFullYear()
      : new Date().getUTCFullYear();

    const teamMap = apiFootballConfigured()
      ? await getApiFootballTeamMap(season, bootstrap.teams)
      : null;

    function crestFor(fplTeamId) {
      return teamMap?.byFplTeamId.get(fplTeamId)?.logo || null;
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
      their team plays twice in the same Gameweek.
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

            return {
              id: element.id,
              name: element.web_name,
              position: type?.singular_name_short || '',
              started
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

    const rows = await Promise.all(
      (Array.isArray(fixtures) ? fixtures : [])
        .slice()
        .sort(
          (a, b) =>
            new Date(a.kickoff_time || 0) -
            new Date(b.kickoff_time || 0)
        )
        .map(async fixture => {
          const home = teamsById.get(fixture.team_h);
          const away = teamsById.get(fixture.team_a);

          const status =
            fixture.finished || fixture.finished_provisional
              ? 'final'
              : fixture.started
                ? 'live'
                : 'upcoming';

          const baseEvents =
            status === 'upcoming'
              ? null
              : eventsFor(fixture, status);

          // Nothing to enrich before kickoff, and no point spending
          // api-football's free-tier quota on it.
          const enriched =
            baseEvents && teamMap
              ? await enrichFixtureFromApiFootball({
                  homeTeamId: fixture.team_h,
                  awayTeamId: fixture.team_a,
                  kickoff: fixture.kickoff_time,
                  isFinal: status === 'final',
                  season,
                  teamMap
                })
              : null;

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
              baseEvents
                ? { ...baseEvents, enriched }
                : null,
            lineups: lineupFor(fixture)
          };
        })
    );

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
