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
  kicked off) the live or final score. Independent of
  any manager's squad, so this is cheap and cacheable
  compared to /api/squads.
  ===================================================
*/

export default async function handler(req, res) {
  const gw = Number(req.query.gw || 0);

  if (!Number.isInteger(gw) || gw < 1 || gw > 38) {
    return res.status(400).json({ error: 'Invalid Gameweek' });
  }

  try {
    const [bootstrap, fixtures] = await Promise.all([
      getJson(`${FPL}/bootstrap-static/`),
      getJson(`${FPL}/fixtures/?event=${gw}`)
    ]);

    const teamsById = new Map(
      (bootstrap.teams || []).map(team => [team.id, team])
    );

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
          homeScore:
            status === 'upcoming'
              ? null
              : fixture.team_h_score ?? 0,
          awayScore:
            status === 'upcoming'
              ? null
              : fixture.team_a_score ?? 0,
          status
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
