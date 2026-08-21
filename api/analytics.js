const FPL = 'https://fantasy.premierleague.com/api';

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

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map(v => (v - mean) ** 2));
  return Math.sqrt(variance);
}

/*
  ===================================================
  HANDLER

  GET /api/analytics?entries=<id,id,id>&throughGw=<n>

  Season-wide stats that need every manager's FULL
  points history, not just the current Gameweek - so
  this hits /entry/{id}/history/ ONCE per manager
  (that endpoint already returns every Gameweek played
  so far in one shot) rather than once per Gameweek,
  which is what made /api/dashboard slow/502-prone
  before that was fixed. Meant to be called lazily
  (only when the Analytics tab is opened), not on
  every page load.
  ===================================================
*/

export default async function handler(req, res) {
  const throughGw = Number(req.query.throughGw || 38);

  const entryIds = String(req.query.entries || '')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value > 0);

  if (!entryIds.length) {
    return res.status(400).json({ error: 'No entries provided' });
  }

  try {
    const histories = await Promise.all(
      entryIds.map(async entryId => {
        try {
          const history = await getJson(`${FPL}/entry/${entryId}/history/`);

          const weeks = (Array.isArray(history.current) ? history.current : [])
            .filter(week => week.event <= throughGw)
            .map(week => ({
              gw: week.event,
              points: week.points ?? 0
            }));

          return { entryId, error: null, weeks };

        } catch (error) {
          return { entryId, error: error.message || 'Unable to load history', weeks: [] };
        }
      })
    );

    /*
      Build a per-Gameweek leaderboard so we can find,
      for each week, who scored highest and who scored
      lowest (ties included on both ends).
    */

    const byGw = new Map();

    for (const entry of histories) {
      for (const week of entry.weeks) {
        if (!byGw.has(week.gw)) byGw.set(week.gw, []);
        byGw.get(week.gw).push({ entryId: entry.entryId, points: week.points });
      }
    }

    let highestGwScore = null;
    const lastPlaceCounts = {};

    for (const [gw, rows] of byGw.entries()) {
      if (!rows.length) continue;

      const maxPoints = Math.max(...rows.map(r => r.points));
      const minPoints = Math.min(...rows.map(r => r.points));

      for (const row of rows) {
        if (
          !highestGwScore ||
          row.points > highestGwScore.points
        ) {
          highestGwScore = { entryId: row.entryId, points: row.points, gw };
        }

        if (row.points === minPoints && rows.length > 1) {
          lastPlaceCounts[row.entryId] = (lastPlaceCounts[row.entryId] || 0) + 1;
        }
      }
    }

    const entries = histories.map(entry => {
      const points = entry.weeks.map(w => w.points);

      return {
        entryId: entry.entryId,
        error: entry.error,
        weeksPlayed: points.length,
        seasonAvg: Math.round(average(points) * 10) / 10,
        stdDev: Math.round(standardDeviation(points) * 10) / 10,
        lastPlaceCount: lastPlaceCounts[entry.entryId] || 0
      };
    });

    return res.status(200).json({
      throughGw,
      entries,
      highestGwScore,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analytics API error:', error);

    return res.status(502).json({
      error: error.message || 'Unable to connect to FPL.'
    });
  }
}
