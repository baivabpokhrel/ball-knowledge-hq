const FPL = 'https://fantasy.premierleague.com/api';

/*
  Same reasoning as api/dashboard.js: FPL's API gets slow/rate-
  limited under load (every fantasy app hits it around deadlines
  and during live matches), so every outbound call gets a timeout
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
  Chip codes FPL returns on entry_history / active_chip,
  mapped to a friendly label used across the UI.
*/
const CHIP_LABELS = {
  wildcard: 'Wildcard',
  freehit: 'Free Hit',
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
  manager: 'Assistant Manager'
};

function chipLabel(code) {
  return CHIP_LABELS[code] || null;
}

/*
  ===================================================
  HANDLER

  GET /api/squads?gw=<gw>&entries=<id,id,id>

  Returns each manager's picks for that Gameweek
  (captain, vice-captain, chip, starting XI, bench)
  plus a predicted-points figure per manager built
  from FPL's own "ep_this" (expected points) values.

  Only meaningful for a Gameweek whose deadline has
  already passed - FPL's picks endpoint hides other
  managers' teams until then, so callers should not
  request a not-yet-locked Gameweek.
  ===================================================
*/

export default async function handler(req, res) {
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
    const bootstrap = await getJson(`${FPL}/bootstrap-static/`);

    const elementsById = new Map(
      bootstrap.elements.map(element => [element.id, element])
    );

    const teamsById = new Map(
      bootstrap.teams.map(team => [team.id, team])
    );

    const typesById = new Map(
      bootstrap.element_types.map(type => [type.id, type])
    );

    const squads = await Promise.all(
      entryIds.map(async entryId => {
        try {
          const picksData = await getJson(
            `${FPL}/entry/${entryId}/event/${gw}/picks/`
          );

          const rawPicks = Array.isArray(picksData.picks)
            ? picksData.picks
            : [];

          let predictedTotal = 0;
          const contributions = [];

          const picks = rawPicks
            .slice()
            .sort((a, b) => a.position - b.position)
            .map(pick => {
              const element = elementsById.get(pick.element);
              const team = element
                ? teamsById.get(element.team)
                : null;
              const type = element
                ? typesById.get(element.element_type)
                : null;

              const epThis = element
                ? Number(element.ep_this || 0)
                : 0;

              /*
                FPL's own "multiplier" already reflects
                whatever chip is active - 0 for a normal
                bench spot, 1 if Bench Boost is on, 2 for
                a captain, 3 if Triple Captain is on - so
                we just multiply straight through.
              */

              const contribution =
                epThis * (pick.multiplier || 0);

              predictedTotal += contribution;

              const player = {
                id: pick.element,
                name: element?.web_name || 'Unknown',
                team: team?.short_name || '',
                position: type?.singular_name_short || '',
                slot: pick.position,
                onBench: pick.position > 11,
                multiplier: pick.multiplier || 0,
                isCaptain: !!pick.is_captain,
                isViceCaptain: !!pick.is_vice_captain,
                eventPoints: element?.event_points ?? 0,
                expectedPoints:
                  Math.round(epThis * 10) / 10,
                predictedContribution:
                  Math.round(contribution * 10) / 10
              };

              if (pick.multiplier > 0) {
                contributions.push(player);
              }

              return player;
            });

          contributions.sort(
            (a, b) =>
              b.predictedContribution -
              a.predictedContribution
          );

          const captain =
            picks.find(player => player.isCaptain) || null;

          const viceCaptain =
            picks.find(player => player.isViceCaptain) ||
            null;

          return {
            entryId,
            error: null,
            activeChip: picksData.active_chip || null,
            activeChipLabel: chipLabel(picksData.active_chip),
            actualPoints:
              picksData.entry_history?.points ?? null,
            transfers:
              picksData.entry_history?.event_transfers ?? 0,
            transferCost:
              picksData.entry_history
                ?.event_transfers_cost ?? 0,
            predictedTotal:
              Math.round(predictedTotal * 10) / 10,
            captain,
            viceCaptain,
            topContributors: contributions.slice(0, 3),
            startingXI: picks.filter(
              player => !player.onBench
            ),
            bench: picks.filter(
              player => player.onBench
            )
          };

        } catch (error) {
          return {
            entryId,
            error:
              error.message ||
              'Unable to load this squad'
          };
        }
      })
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
