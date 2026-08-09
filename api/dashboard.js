const FPL = 'https://fantasy.premierleague.com/api';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'BallKnowledgeHQ/0.2' } });
  if (!r.ok) throw new Error(`FPL returned ${r.status}`);
  return r.json();
}

function eventStatus(event) {
  if (event?.data_checked) return { code: 'FINAL', label: 'Final after FPL checks', final: true };
  if (event?.finished) return { code: 'PROCESSING', label: 'Waiting for bonuses and corrections', final: false };
  return { code: 'LIVE', label: 'Live / provisional points', final: false };
}

export default async function handler(req, res) {
  const leagueId = String(req.query.leagueId || process.env.FPL_LEAGUE_ID || '92378').trim();
  const requestedGw = Number(req.query.gw || 0);
  if (!/^\d+$/.test(leagueId)) return res.status(400).json({ error: 'Numeric league ID required', needsLeagueId: true });

  try {
    const bootstrap = await getJson(`${FPL}/bootstrap-static/`);
    let event = requestedGw ? bootstrap.events.find(e => e.id === requestedGw) : null;
    event ||= bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_previous) || bootstrap.events[0];
    const gw = event.id;
    const standings = await getJson(`${FPL}/leagues-classic/${leagueId}/standings/?page_standings=1`);
    const rows = standings?.standings?.results || [];

    const detailed = await Promise.all(rows.map(async row => {
      let points = row.event_total ?? 0;
      try {
        const history = await getJson(`${FPL}/entry/${row.entry}/history/`);
        const current = history.current?.find(x => x.event === gw);
        if (current) points = current.points;
      } catch {}
      return {
        rank: row.rank,
        overallRank: row.rank,
        lastRank: row.last_rank,
        entryId: row.entry,
        manager: row.player_name,
        team: row.entry_name,
        gameweekPoints: points,
        seasonPoints: row.total,
        movement: row.last_rank ? row.last_rank - row.rank : 0
      };
    }));

    const weekly = [...detailed].sort((a,b) => b.gameweekPoints - a.gameweekPoints || a.manager.localeCompare(b.manager));
    const overall = [...detailed].sort((a,b) => b.seasonPoints - a.seasonPoints);
    const status = eventStatus(event);
    const topScore = weekly[0]?.gameweekPoints ?? null;
    const winners = weekly.filter(x => x.gameweekPoints === topScore);

    res.status(200).json({
      league: { id: leagueId, name: standings?.league?.name || 'Ball Knowledge Only' },
      gameweek: { id: gw, name: event.name, deadline: event.deadline_time, finished: !!event.finished, dataChecked: !!event.data_checked, status },
      updatedAt: new Date().toISOString(),
      weekly,
      overall,
      awards: {
        winners,
        managerOfTheWeek: status.final ? winners : [],
        provisionalLeader: winners,
        fraudOfTheWeek: status.final ? weekly.slice(-1) : []
      }
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
