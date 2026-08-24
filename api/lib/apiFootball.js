/*
  Optional enrichment source: api-football.com (API-Sports).

  FPL's own API is aggregate-count-only - no minute for a goal, no
  minute for a card, and no substitution-pairing data at all (who
  came off, who came on, when). api-football.com's free tier does
  have that data, so when an API_FOOTBALL_KEY is configured this
  module resolves it and the Fixtures tab gets real minutes and real
  substitution pairs instead of just "these players featured".

  This is entirely optional and fails soft everywhere: with no key
  configured, or if a call errors/times out/gets rate-limited, every
  function here returns null and api/fixtures.js falls back to its
  existing FPL-only data exactly as before. Nothing here can break
  the page - it can only add detail to it.

  Free-tier budget: 100 requests/day, 10/minute. Every call in this
  file is cached (module-level, so it only helps within one warm
  serverless instance, but that's enough to keep a 15-manager league
  well under quota):
    - the season's team list (id + logo per club) - cached for the
      life of the instance, since club ids/logos don't change
      mid-season.
    - one Gameweek's fixture list from api-football, used to match
      an FPL fixture to its api-football id - cached a few minutes.
    - one fixture's events - cached indefinitely once that match is
      final (the data can't change anymore), briefly otherwise.
*/

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || '';
const PREMIER_LEAGUE_ID = 39;
const TIMEOUT_MS = 6000;

const teamMapCache = new Map();
const fixturesCache = new Map();
const eventsCache = new Map();

export function apiFootballConfigured() {
  return !!API_FOOTBALL_KEY;
}

async function apiFootballGet(path) {
  if (!apiFootballConfigured()) {
    return null;
  }

  try {
    const response = await fetch(`${API_FOOTBALL_BASE}${path}`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!response.ok) {
      console.error(`api-football returned ${response.status} for ${path}`);
      return null;
    }

    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    if (remaining !== null && Number(remaining) <= 5) {
      console.error(`api-football daily quota nearly exhausted: ${remaining} left`);
    }

    return response.json();

  } catch (error) {
    console.error(`api-football request failed for ${path}:`, error.message);
    return null;
  }
}

/*
  A handful of FPL team names/short names don't literally match
  api-football's (which uses full official club names) - everything
  else is matched by a normalized (lowercase, no punctuation/suffix)
  compare against both FPL's long name and short name.
*/
const NAME_ALIASES = {
  "nott'm forest": 'nottingham forest',
  'man utd': 'manchester united',
  'man city': 'manchester city',
  spurs: 'tottenham',
  wolves: 'wolverhampton wanderers'
};

function normalizeTeamName(name) {
  const lower = (name || '').toLowerCase().trim();
  const aliased = NAME_ALIASES[lower] || lower;

  return aliased
    .replace(/\bafc\b|\bfc\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/*
  FPL team id -> { id: apiFootballTeamId, logo } for one season,
  built from api-football's own /teams list, name-matched against
  FPL's bootstrap teams. Matched dynamically (not a hardcoded id
  table) since api-football's numeric team ids can't be verified
  without a live call this dev environment's network can't make -
  matching by name is more resilient to that than guessing ids.
*/
export async function getApiFootballTeamMap(season, bootstrapTeams) {
  if (!apiFootballConfigured()) {
    return null;
  }

  const cached = teamMapCache.get(season);
  if (cached) {
    return cached;
  }

  const response = await apiFootballGet(
    `/teams?league=${PREMIER_LEAGUE_ID}&season=${season}`
  );

  const apiTeams = response?.response || [];

  if (!apiTeams.length) {
    return null;
  }

  const byNormalizedName = new Map(
    apiTeams.map(entry => [
      normalizeTeamName(entry.team?.name),
      { id: entry.team?.id, logo: entry.team?.logo || null }
    ])
  );

  const byFplTeamId = new Map();

  for (const team of bootstrapTeams || []) {
    const match =
      byNormalizedName.get(normalizeTeamName(team.name)) ||
      byNormalizedName.get(normalizeTeamName(team.short_name));

    if (match) {
      byFplTeamId.set(team.id, match);
    }
  }

  const map = { byFplTeamId };
  teamMapCache.set(season, map);
  return map;
}

async function getFixturesInRange(season, fromDate, toDate) {
  const key = `${season}:${fromDate}:${toDate}`;
  const cached = fixturesCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const response = await apiFootballGet(
    `/fixtures?league=${PREMIER_LEAGUE_ID}&season=${season}&from=${fromDate}&to=${toDate}`
  );

  const data = response?.response || [];

  fixturesCache.set(key, {
    data,
    // Short TTL - a Gameweek's matches are spread across several
    // days, so this may legitimately get refetched a handful of
    // times over the week, not just once.
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  return data;
}

async function getFixtureEvents(apiFixtureId, isFinal) {
  const cached = eventsCache.get(apiFixtureId);

  if (cached && (cached.final || cached.expiresAt > Date.now())) {
    return cached.data;
  }

  const response = await apiFootballGet(
    `/fixtures/events?fixture=${apiFixtureId}`
  );

  const data = response?.response || null;

  if (data) {
    eventsCache.set(apiFixtureId, {
      data,
      final: !!isFinal,
      expiresAt: Date.now() + 2 * 60 * 1000
    });
  }

  return data;
}

/*
  Given one FPL fixture (already resolved to home/away FPL team ids
  and a kickoff timestamp) plus this season's team map, finds the
  matching api-football fixture and returns its events parsed into
  goals/cards/subs, each carrying a real minute - or null if
  anything along the way isn't available (not configured, teams
  didn't map, no matching fixture found, no events yet), which the
  caller treats exactly like "no enrichment for this fixture" and
  falls back to FPL's own aggregate data.
*/
export async function enrichFixtureFromApiFootball({
  homeTeamId,
  awayTeamId,
  kickoff,
  isFinal,
  season,
  teamMap
}) {

  if (!apiFootballConfigured() || !teamMap) {
    return null;
  }

  const home = teamMap.byFplTeamId.get(homeTeamId);
  const away = teamMap.byFplTeamId.get(awayTeamId);

  if (!home || !away || !kickoff) {
    return null;
  }

  const kickoffDate = new Date(kickoff);
  const pad = offsetMs =>
    new Date(kickoffDate.getTime() + offsetMs).toISOString().slice(0, 10);

  const fromDate = pad(-2 * 24 * 60 * 60 * 1000);
  const toDate = pad(2 * 24 * 60 * 60 * 1000);

  const candidates = await getFixturesInRange(season, fromDate, toDate);

  const match = candidates.find(
    entry =>
      entry.teams?.home?.id === home.id &&
      entry.teams?.away?.id === away.id
  );

  if (!match) {
    return null;
  }

  const rawEvents = await getFixtureEvents(match.fixture.id, isFinal);

  if (!rawEvents) {
    return null;
  }

  const goals = [];
  const cards = [];
  const subs = [];

  function minuteLabel(time) {
    if (!time || time.elapsed == null) {
      return null;
    }
    return time.extra ? `${time.elapsed}+${time.extra}` : `${time.elapsed}`;
  }

  for (const event of rawEvents) {
    const side = event.team?.id === match.teams.home.id ? 'h' : 'a';
    const minute = minuteLabel(event.time);

    if (event.type === 'Goal') {

      goals.push({
        name: event.player?.name || 'Unknown',
        assistName: event.assist?.name || null,
        minute,
        team: side,
        isPenalty: event.detail === 'Penalty',
        isOwnGoal: event.detail === 'Own Goal'
      });

    } else if (event.type === 'Card') {

      cards.push({
        name: event.player?.name || 'Unknown',
        minute,
        team: side,
        cardType: event.detail?.includes('Red') ? 'red' : 'yellow'
      });

    } else if (event.type === 'subst') {

      /*
        NOTE: api-football's documented shape wasn't independently
        verifiable from this dev environment (its network egress is
        blocked here), so this off/on assignment - player=coming
        OFF, assist=coming ON - is api-football's most commonly
        documented convention but is UNVERIFIED against a real
        response. If real matches show this backwards, swap these
        two lines - everything downstream just reads offName/onName.
      */
      subs.push({
        offName: event.player?.name || 'Unknown',
        onName: event.assist?.name || null,
        minute,
        team: side
      });

    }
  }

  return {
    goals,
    cards,
    subs,
    homeCrest: home.logo,
    awayCrest: away.logo
  };

}
