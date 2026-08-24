const $ = (id) =>
  document.getElementById(id);


const LEAGUE_ID =
  '92378';


const GW_ENTRY_FEE =
  20;


const VALID_TABS = [
  'gameweek',
  'payments',
  'predictions',
  'squads',
  'analytics',
  'fixtures'
];


/*
  Current league/dashboard data.

  IMPORTANT:
  This always represents the CURRENT GW
  and is used for:
  - manager roster
  - current GW number
  - overall standings
  - payments
*/

let dashboardData =
  null;


/*
  This represents whichever GW is currently
  being viewed inside the GW tab.
*/

let gwViewData =
  null;


let selectedGw =
  1;


let allPayments =
  [];


let allGwSettings =
  [];


let paymentMeta =
  null;


let activeShareGw =
  null;


/*
  Predicted-points + picks data for the CURRENT
  Gameweek only (FPL hides other managers' picks
  until the Gameweek deadline, and "ep_this" only
  ever describes FPL's current live Gameweek, so
  this feature never looks at past Gameweeks).
*/

let squadsData =
  null;


let squadsLoading =
  false;


let selectedSquadEntry =
  null;


/*
  Squads tab "Compare" mode - lets a manager see their
  squad head-to-head against another manager's for the
  current Gameweek (who's still to play, and what each
  side realistically needs from their remaining players).
*/

let compareMode =
  false;


let compareEntry =
  null;


/*
  "What if" scenario state for the Compare screen's real-
  points simulator - keyed by "entryId:playerId". Only
  created once a user actually changes a control away from
  its untouched default (see isScenarioMeaningful), so a
  player nobody has tapped never contributes any points.
  Persists for the session so switching opponents doesn't
  lose what you've already set up.
*/

let compareScenarios =
  {};

let activeScenarioEntry =
  null;

let activeScenarioPlayerId =
  null;


/*
  Real-world fixtures/results - independent of any manager's
  squad. fixturesGw defaults to the current Gameweek but can
  be switched via the tab's own GW selector; fixturesData
  always holds just that one Gameweek's fixtures.
*/

let fixturesData =
  null;


let fixturesLoading =
  false;


let fixturesGw =
  null;


/*
  Which real-world fixture the "tap a match" detail sheet is
  currently showing.
*/

let activeFixtureId =
  null;


/* =====================================================
   BASIC HELPERS
===================================================== */

function escapeHtml(value) {

  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

}


function getCurrentGw() {

  return Number(
    dashboardData
      ?.gameweek
      ?.id ||
    1
  );

}


/* =====================================================
   URL HELPERS
===================================================== */

function getRequestedTab() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const tab =
    params.get('tab');


  return VALID_TABS.includes(tab)
    ? tab
    : 'gameweek';

}


function getRequestedGw() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const value =
    Number(
      params.get('gw')
    );


  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 38
  ) {

    return null;

  }


  return value;

}


function updateUrl(
  tab,
  gw = null,
  push = true
) {

  const url =
    new URL(
      window.location.href
    );


  url.searchParams.set(
    'tab',
    tab
  );


  /*
    Both the Gameweek tab and Payments tab
    can have a specific GW.
  */

  if (
    (
      tab === 'gameweek' ||
      tab === 'payments'
    ) &&
    gw
  ) {

    url.searchParams.set(
      'gw',
      gw
    );

  } else {

    url.searchParams.delete(
      'gw'
    );

  }


  const state = {
    tab,
    gw
  };


  if (push) {

    window.history.pushState(
      state,
      '',
      url
    );

  } else {

    window.history.replaceState(
      state,
      '',
      url
    );

  }

}


/* =====================================================
   PAYMENT HELPERS
===================================================== */

function paymentFor(
  gw,
  entryId
) {

  return (
    allPayments.find(
      item =>
        Number(
          item.gameweek
        ) ===
        Number(gw)
        &&
        Number(
          item.entry_id
        ) ===
        Number(entryId)
    ) ||
    null
  );

}


function paidFor(
  gw,
  entryId
) {

  return (
    paymentFor(
      gw,
      entryId
    )?.paid === true
  );

}


function settingForGw(gw) {

  return (
    allGwSettings.find(
      item =>
        Number(
          item.gameweek
        ) ===
        Number(gw)
    ) ||
    null
  );

}


function zelleForGw(gw) {

  return (
    settingForGw(gw)
      ?.zelle_display ||
    ''
  );

}


function manualWinnersForGw(gw) {

  if (!dashboardData) {
    return [];
  }


  const rows =
    allPayments.filter(
      item =>
        Number(
          item.gameweek
        ) ===
        Number(gw)
        &&
        item.winner ===
        true
    );


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  return rows
    .map(
      row =>
        managers.find(
          manager =>
            Number(
              manager.entryId
            ) ===
            Number(
              row.entry_id
            )
        )
    )
    .filter(Boolean);

}


/*
  Older call sites that only ever expected a single
  winner. Kept as a thin wrapper so nothing breaks;
  new code (multi-winner-aware) should prefer
  manualWinnersForGw.
*/

function manualWinnerForGw(gw) {

  return (
    manualWinnersForGw(gw)[0] ||
    null
  );

}


function unpaidManagersForGw(gw) {

  if (!dashboardData) {
    return [];
  }


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  return managers.filter(
    manager =>
      !paidFor(
        gw,
        manager.entryId
      )
  );

}


/* =====================================================
   STANDINGS ROW
===================================================== */

function standingsRow(
  manager,
  index,
  weekly
) {

  const movement =
    manager.movement > 0
      ? `▲ ${manager.movement}`
      : manager.movement < 0
        ? `▼ ${Math.abs(manager.movement)}`
        : '—';


  const isCurrentGwWeekly =
    weekly &&
    getCurrentGw() ===
      (gwViewData?.gameweek?.id || 0);


  const weeklySquad =
    isCurrentGwWeekly
      ? squadFor(manager.entryId)
      : null;


  const chip =
    weeklySquad?.activeChipLabel ||
    null;


  const playProgress =
    isCurrentGwWeekly
      ? squadPlayProgress(manager.entryId)
      : null;


  const captainName =
    weeklySquad?.captain?.name ||
    null;


  return `
    <div
      class="standing-row ${weekly ? 'standing-row-clickable' : ''}"
      ${weekly ? `data-entry="${manager.entryId}"` : ''}
    >

      <div class="position">
        ${index + 1}
      </div>


      <div class="manager-info">

        <strong>
          ${escapeHtml(manager.manager)}
          ${
            chip
              ? `<span class="chip-badge">${escapeHtml(chip)}</span>`
              : ''
          }
        </strong>

        <small>
          ${escapeHtml(manager.team)}
        </small>

        ${
          captainName || playProgress
            ? `
              <small class="standing-meta">
                ${
                  captainName
                    ? `🧢 ${escapeHtml(captainName)}`
                    : ''
                }
                ${
                  captainName && playProgress
                    ? ' &middot; '
                    : ''
                }
                ${
                  playProgress
                    ? playProgressText(playProgress)
                    : ''
                }
              </small>
            `
            : ''
        }

      </div>


      <div class="points">

        <strong>
          ${
            weekly
              ? manager.gameweekPoints
              : manager.seasonPoints
          }
        </strong>

        <small>
          ${
            weekly
              ? 'GW PTS'
              : movement
          }
        </small>

      </div>

      ${
        weekly
          ? '<div class="standing-row-arrow">›</div>'
          : ''
      }

    </div>
  `;

}


/* =====================================================
   CURRENT LEAGUE / OVERALL RENDER
===================================================== */

function renderCurrentLeagueData() {

  if (!dashboardData) {
    return;
  }


  const data =
    dashboardData;


  const managers =
    Array.isArray(
      data.managers
    )
      ? data.managers
      : [];


  if ($('league')) {

    $('league')
      .textContent =
        data.league?.name ||
        'Ball Knowledge Only';

  }


  if ($('connectionStatus')) {

    $('connectionStatus')
      .textContent =
        `● FPL CONNECTED • ${managers.length} MANAGERS`;


    $('connectionStatus')
      .className =
        'connection connected';

  }


  renderAnalytics();

}


/* =====================================================
   ANALYTICS (GW wins, season points, averages)
===================================================== */

function gwWinsByEntry() {

  const wins = {};


  if (!dashboardData) {
    return wins;
  }


  const currentGw =
    getCurrentGw();


  for (
    let gw = 1;
    gw <= currentGw;
    gw++
  ) {

    const winners =
      manualWinnersForGw(
        gw
      );


    for (const winner of winners) {

      const key =
        Number(
          winner.entryId
        );


      wins[key] =
        (wins[key] || 0) + 1;

    }

  }


  return wins;

}


/*
  Season-wide stats (highest GW score, fraud of the
  week, most consistent manager) need every manager's
  full points history - fetched once, lazily, from
  /api/analytics rather than on every page load.
*/

let analyticsData =
  null;


let analyticsLoading =
  false;


async function loadAnalyticsData() {

  if (
    !dashboardData ||
    analyticsLoading
  ) {
    return;
  }


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  if (!managers.length) {
    return;
  }


  analyticsLoading =
    true;


  try {

    const entries =
      managers
        .map(
          manager =>
            manager.entryId
        )
        .join(',');


    /*
      FPL's own /entry/{id}/history/ endpoint reports a
      placeholder row (often 0 pts for everyone) for a
      Gameweek that is still live/in-progress and hasn't
      been "checked"/finalized yet. Including that row in
      the season-stats calculation corrupts Highest GW
      Score / Fraud of the Week / Most Consistent (e.g.
      everyone ties for "last place" in the bogus 0-pt
      week). So: only include the current GW once FPL has
      actually finalized it - otherwise stop one GW short.
    */

    const currentGw =
      getCurrentGw();

    const currentGwFinal =
      !!dashboardData
        ?.gameweek
        ?.status
        ?.final;

    const throughGw =
      currentGwFinal
        ? currentGw
        : Math.max(
            0,
            currentGw - 1
          );


    const response =
      await fetch(
        `/api/analytics?entries=${entries}&throughGw=${throughGw}&_=${Date.now()}`,
        {
          cache:
            'no-store'
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        'Unable to load analytics'
      );

    }


    analyticsData =
      data;


    renderAnalytics();


  } catch (error) {

    console.error(
      'Analytics load failed:',
      error
    );


    if (
      $('analyticsBody') &&
      !analyticsData
    ) {

      $('analyticsBody')
        .innerHTML = `
          <div class="empty">
            ${escapeHtml(error.message)}
          </div>
        `;

    }

  } finally {

    analyticsLoading =
      false;

  }

}


function findManagerByEntry(entryId) {

  return (
    (
      dashboardData
        ?.managers ||
      []
    ).find(
      manager =>
        Number(
          manager.entryId
        ) ===
        Number(entryId)
    ) ||
    null
  );

}


function renderAnalytics() {

  if (
    !dashboardData ||
    !$('analyticsBody')
  ) {
    return;
  }


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  if (!managers.length) {

    $('analyticsBody').innerHTML = `
      <div class="empty">
        No analytics yet.
      </div>
    `;

    return;

  }


  if (
    !analyticsData &&
    !analyticsLoading
  ) {

    loadAnalyticsData();

  }


  $('analyticsBody').innerHTML =
    buildGwWinsHtml(managers) +
    buildSeasonSpotlightHtml(managers) +
    buildRecentChampionsHtml();

}


function buildGwWinsHtml(managers) {

  const wins =
    gwWinsByEntry();


  const rows =
    managers
      .map(
        manager => ({
          manager,
          wins:
            wins[
              Number(
                manager.entryId
              )
            ] || 0
        })
      )
      .filter(
        row => row.wins > 0
      )
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          a.manager.manager.localeCompare(
            b.manager.manager
          )
      );


  return `
    <div class="analytics-section">

      <p class="analytics-section-title">
        🏆 GW Wins
      </p>

      <div class="standings-list">
        ${
          rows.length
            ? rows
                .map(
                  (row, index) => `
                    <div class="standing-row">

                      <div class="position">
                        ${index + 1}
                      </div>


                      <div class="manager-info">

                        <strong>
                          ${escapeHtml(row.manager.manager)}
                        </strong>

                        <small>
                          ${escapeHtml(row.manager.team)}
                        </small>

                      </div>


                      <div class="points">

                        <strong>
                          ${row.wins} 🏆
                        </strong>

                        <small>
                          ${row.wins === 1 ? 'WIN' : 'WINS'}
                        </small>

                      </div>

                    </div>
                  `
                )
                .join('')
            : `
              <div class="empty">
                No Gameweek winners recorded yet.
              </div>
            `
        }
      </div>

    </div>
  `;

}


function spotlightCard({
  icon,
  manager,
  fallback,
  value,
  valueLabel
}) {

  return `
    <div class="analytics-spotlight-card">

      <span class="spotlight-icon">
        ${icon}
      </span>


      <div class="spotlight-body">

        <strong>
          ${
            manager
              ? escapeHtml(manager.manager)
              : escapeHtml(fallback || 'Unknown')
          }
        </strong>

        <small>
          ${manager ? escapeHtml(manager.team) : ''}
        </small>

      </div>


      <div class="spotlight-value">

        <strong>
          ${value}
        </strong>

        <small>
          ${valueLabel}
        </small>

      </div>

    </div>
  `;

}


function buildSeasonSpotlightHtml(managers) {

  if (!analyticsData) {

    return `
      <div class="analytics-section">
        <p class="analytics-section-title">
          Season Spotlight
        </p>
        <div class="empty">
          Loading season stats…
        </div>
      </div>
    `;

  }


  const entries =
    Array.isArray(
      analyticsData.entries
    )
      ? analyticsData.entries
      : [];


  const cards = [];


  if (analyticsData.highestGwScore) {

    const manager =
      findManagerByEntry(
        analyticsData.highestGwScore.entryId
      );


    cards.push(
      spotlightCard({
        icon: '🔥',
        manager,
        fallback: 'Unknown',
        value:
          `${analyticsData.highestGwScore.points} pts`,
        valueLabel:
          `GW${analyticsData.highestGwScore.gw} • HIGHEST SCORE`
      })
    );

  }


  const topFraud =
    entries
      .filter(
        entry =>
          entry.lastPlaceCount > 0
      )
      .sort(
        (a, b) =>
          b.lastPlaceCount -
          a.lastPlaceCount
      )[0];


  if (topFraud) {

    const manager =
      findManagerByEntry(
        topFraud.entryId
      );


    cards.push(
      spotlightCard({
        icon: '💀',
        manager,
        fallback: 'Unknown',
        value:
          topFraud.lastPlaceCount,
        valueLabel:
          `${topFraud.lastPlaceCount === 1 ? 'LAST-PLACE FINISH' : 'LAST-PLACE FINISHES'} • FRAUD OF THE WEEK`
      })
    );

  }


  const mostConsistent =
    entries
      .filter(
        entry => entry.weeksPlayed >= 2
      )
      .sort(
        (a, b) =>
          a.stdDev - b.stdDev
      )[0];


  if (mostConsistent) {

    const manager =
      findManagerByEntry(
        mostConsistent.entryId
      );


    cards.push(
      spotlightCard({
        icon: '📊',
        manager,
        fallback: 'Unknown',
        value:
          mostConsistent.seasonAvg.toFixed(1),
        valueLabel:
          'AVG PTS • MOST CONSISTENT'
      })
    );

  }


  if (!cards.length) {

    return `
      <div class="analytics-section">
        <p class="analytics-section-title">
          Season Spotlight
        </p>
        <div class="empty">
          Not enough Gameweeks played yet.
        </div>
      </div>
    `;

  }


  return `
    <div class="analytics-section">
      <p class="analytics-section-title">
        Season Spotlight
      </p>
      ${cards.join('')}
    </div>
  `;

}


function buildRecentChampionsHtml() {

  const currentGw =
    getCurrentGw();


  const rows = [];


  for (
    let gw = currentGw;
    gw >= 1 && rows.length < 5;
    gw--
  ) {

    const winners =
      manualWinnersForGw(gw);


    if (!winners.length) {
      continue;
    }


    rows.push({
      gw,
      winners
    });

  }


  return `
    <div class="analytics-section">

      <p class="analytics-section-title">
        Recent Champions
      </p>

      <div class="standings-list">
        ${
          rows.length
            ? rows
                .map(
                  row => `
                    <div class="standing-row">

                      <div class="position position-wide">
                        GW${row.gw}
                      </div>


                      <div class="manager-info">

                        <strong>
                          ${
                            row.winners
                              .map(
                                winner =>
                                  escapeHtml(winner.manager)
                              )
                              .join(', ')
                          }
                        </strong>

                        <small>
                          ${
                            row.winners
                              .map(
                                winner =>
                                  escapeHtml(winner.team)
                              )
                              .join(', ')
                          }
                        </small>

                      </div>

                    </div>
                  `
                )
                .join('')
            : `
              <div class="empty">
                No results recorded yet.
              </div>
            `
        }
      </div>

    </div>
  `;

}


/* =====================================================
   PREDICTIONS + SQUADS DATA (current GW only)
===================================================== */

function gameweekHasStarted() {

  return (
    dashboardData
      ?.gameweek
      ?.status
      ?.code !==
    'PRE-SEASON'
  );

}


function squadFor(entryId) {

  if (
    !squadsData ||
    !Array.isArray(
      squadsData.squads
    )
  ) {
    return null;
  }


  return (
    squadsData.squads.find(
      squad =>
        Number(
          squad.entryId
        ) ===
        Number(entryId)
    ) ||
    null
  );

}


/*
  How many of a manager's players have finished, are
  currently mid-match ("in play"), or haven't kicked off
  yet this Gameweek. Normally only the Starting XI counts
  toward the team total, but with Bench Boost active all
  15 players count, so the breakdown needs to include the
  bench too.
*/

function squadPlayProgress(entryId) {

  const squad =
    squadFor(entryId);

  if (
    !squad ||
    squad.error
  ) {
    return null;
  }


  const isBenchBoost =
    squad.activeChip === 'bboost';

  const players =
    isBenchBoost
      ? [
          ...(squad.startingXI || []),
          ...(squad.bench || [])
        ]
      : (squad.startingXI || []);

  if (!players.length) {
    return null;
  }


  const finished =
    players.filter(
      player => player.status === 'final'
    ).length;

  const live =
    players.filter(
      player => player.status === 'live'
    ).length;

  const upcoming =
    players.length - finished - live;

  return {
    finished,
    live,
    upcoming,
    total: players.length
  };

}


/*
  Turns a squadPlayProgress() result into a short, plain-
  language label - omitting any segment that's currently
  zero so it stays readable ("11 to go" pre-kickoff rather
  than "0 played · 0 live · 11 to go").
*/

function playProgressText(progress) {

  if (!progress) {
    return '';
  }


  const parts = [];

  if (progress.finished) {
    parts.push(`${progress.finished} played`);
  }

  if (progress.live) {
    parts.push(`${progress.live} live`);
  }

  if (progress.upcoming) {
    parts.push(`${progress.upcoming} to go`);
  }

  return (
    parts.join(' &middot; ') ||
    `${progress.total} played`
  );

}


/* =====================================================
   LEAGUE OWNERSHIP (how many of THIS league's managers
   own/captain each player) - derived entirely from the
   squads already fetched for the current Gameweek, so
   no extra API call is needed.
===================================================== */

function computeLeagueOwnership() {

  const ownership =
    new Map();


  if (
    !squadsData ||
    !Array.isArray(
      squadsData.squads
    )
  ) {
    return ownership;
  }


  const managersById =
    new Map(
      (
        dashboardData?.managers ||
        []
      ).map(
        item => [
          Number(item.entryId),
          item
        ]
      )
    );


  for (const squad of squadsData.squads) {

    if (squad.error) {
      continue;
    }


    const ownerManager =
      managersById.get(
        Number(squad.entryId)
      );


    const picks =
      [
        ...(squad.startingXI || []),
        ...(squad.bench || [])
      ];


    for (const player of picks) {

      if (!ownership.has(player.id)) {

        ownership.set(
          player.id,
          {
            id: player.id,
            name: player.name,
            team: player.team,
            ownerCount: 0,
            captainCount: 0,
            livePoints: 0,
            status: 'upcoming',
            owners: []
          }
        );

      }


      const entry =
        ownership.get(player.id);


      entry.ownerCount += 1;


      if (player.isCaptain) {
        entry.captainCount += 1;
      }


      /*
        A player's live points/status are a fact about the
        PLAYER, not the manager who owns them, so every
        owner reports the same value - just take whichever
        copy we see.
      */

      entry.livePoints =
        Number(
          player.livePoints || 0
        );

      entry.status =
        player.status || 'upcoming';


      entry.owners.push({
        manager:
          ownerManager?.manager ||
          'Unknown',
        team:
          ownerManager?.team ||
          '',
        isCaptain:
          !!player.isCaptain
      });

    }

  }


  return ownership;

}


function leagueOwnershipSummary() {

  const ownership =
    computeLeagueOwnership();


  if (!ownership.size) {
    return null;
  }


  const entries =
    [...ownership.values()];


  const totalManagers =
    squadsData.squads.filter(
      squad => !squad.error
    ).length;


  const mostOwned =
    entries.reduce(
      (best, entry) =>
        entry.ownerCount >
        (best?.ownerCount || 0)
          ? entry
          : best,
      null
    );


  const mostCaptained =
    entries.reduce(
      (best, entry) =>
        entry.captainCount >
        (best?.captainCount || 0)
          ? entry
          : best,
      null
    );


  /*
    Top scorer this Gameweek - only meaningful once at
    least one player has actually kicked off.
  */

  const topScorer =
    entries
      .filter(
        entry => entry.status !== 'upcoming'
      )
      .reduce(
        (best, entry) =>
          entry.livePoints >
          (best?.livePoints || 0)
            ? entry
            : best,
        null
      );


  const chipsInPlay =
    squadsData.squads.filter(
      squad =>
        !squad.error &&
        squad.activeChip
    ).length;


  return {
    ownership,
    totalManagers,
    mostOwned,
    mostCaptained,
    topScorer,
    chipsInPlay
  };

}


function buildLeaguePicksCardHtml() {

  const summary =
    leagueOwnershipSummary();


  if (!summary) {
    return '';
  }


  const {
    totalManagers,
    mostOwned,
    mostCaptained,
    topScorer,
    chipsInPlay
  } =
    summary;


  /*
    Each tile is independent - as more live GW stats get
    added later, they just join this list and the grid
    below lays them out two-per-row automatically instead
    of stacking one on top of another.
  */

  const tiles = [];


  if (mostOwned) {

    tiles.push({
      icon: '👥',
      name: mostOwned.name,
      detail: `${mostOwned.ownerCount}/${totalManagers} managers own`
    });

  }


  if (
    mostCaptained &&
    mostCaptained.captainCount > 0
  ) {

    tiles.push({
      icon: '🎖️',
      name: mostCaptained.name,
      detail:
        `Captained by ${mostCaptained.captainCount} ` +
        `${mostCaptained.captainCount === 1 ? 'manager' : 'managers'}`
    });

  }


  if (
    topScorer &&
    topScorer.livePoints > 0
  ) {

    tiles.push({
      icon: '🔥',
      name: topScorer.name,
      detail: `${topScorer.livePoints} pts this GW so far`
    });

  }


  if (chipsInPlay > 0) {

    tiles.push({
      icon: '⚡',
      name:
        `${chipsInPlay} ${chipsInPlay === 1 ? 'manager' : 'managers'}`,
      detail: 'using a chip this GW'
    });

  }


  if (!tiles.length) {
    return '';
  }


  return `
    <div class="league-picks-card">

      <p class="league-picks-title">
        👥 League Picks &middot; GW${getCurrentGw()}
      </p>

      <div class="league-picks-grid">

        ${
          tiles
            .map(
              tile => `
                <div class="league-picks-stat">
                  <span class="league-picks-icon">${tile.icon}</span>
                  <strong>${escapeHtml(tile.name)}</strong>
                  <small>${escapeHtml(tile.detail)}</small>
                </div>
              `
            )
            .join('')
        }

      </div>

    </div>
  `;

}


function renderLeaguePicksCard() {

  if (!$('leaguePicksCard')) {
    return;
  }


  $('leaguePicksCard').innerHTML =
    buildLeaguePicksCardHtml();

}


async function loadSquadsData() {

  if (
    !dashboardData ||
    !gameweekHasStarted() ||
    squadsLoading
  ) {
    return;
  }


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  if (!managers.length) {
    return;
  }


  squadsLoading =
    true;


  try {

    const gw =
      getCurrentGw();


    const entries =
      managers
        .map(
          manager =>
            manager.entryId
        )
        .join(',');


    const response =
      await fetch(
        `/api/squads?gw=${gw}&entries=${entries}&_=${Date.now()}`,
        {
          cache:
            'no-store'
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        'Unable to load squads'
      );

    }


    squadsData =
      data;


    if (
      !selectedSquadEntry &&
      managers.length
    ) {

      selectedSquadEntry =
        Number(
          managers[0].entryId
        );

    }


    /*
      renderGameweekView() re-renders the whole GW tab -
      standings (captain + played/live/to-go now depend on
      squadsData) as well as the award card - not just
      renderGameweekAward() alone, otherwise the standings
      list keeps showing stale (missing) captain/play-
      progress info until the user leaves and re-enters the
      GW tab after squads finish loading.
    */
    renderGameweekView();

    renderPredictions();

    renderSquadsTab();


  } catch (error) {

    console.error(
      'Squads load failed:',
      error
    );


    if ($('predictionsBody')) {

      $('predictionsBody')
        .innerHTML = `
          <div class="empty">
            ${escapeHtml(error.message)}
          </div>
        `;

    }


    if ($('squadDetail')) {

      $('squadDetail')
        .innerHTML = `
          <div class="empty">
            ${escapeHtml(error.message)}
          </div>
        `;

    }

  } finally {

    squadsLoading =
      false;

  }

}


/* =====================================================
   FIXTURES TAB (real-world matches, not squad-specific)
===================================================== */

/*
  Every Gameweek 1-38, current one first, then descending -
  matches buildPublicGwSelect's convention but doesn't cap at
  the current GW, since a real match schedule is known well
  ahead of time (unlike squads/predictions, which need a
  Gameweek's deadline to have passed).
*/

const SEASON_GW_COUNT = 38;

function buildFixturesGwSelect() {

  const select =
    $('fixturesGwSelect');

  if (
    !select ||
    !dashboardData
  ) {
    return;
  }


  const currentGw =
    getCurrentGw();

  if (fixturesGw == null) {
    fixturesGw = currentGw;
  }


  select.innerHTML =
    '';

  for (
    let gw = SEASON_GW_COUNT;
    gw >= 1;
    gw--
  ) {

    const option =
      document.createElement('option');

    option.value =
      String(gw);

    option.textContent =
      gw === currentGw
        ? `GW ${gw} — Current`
        : `GW ${gw}`;

    select.appendChild(option);

  }

  select.value =
    String(fixturesGw);

}


async function loadFixturesData(gw) {

  if (
    !dashboardData ||
    fixturesLoading
  ) {
    return;
  }


  if (Number.isInteger(gw)) {
    fixturesGw = gw;
  } else if (fixturesGw == null) {
    fixturesGw = getCurrentGw();
  }


  fixturesLoading =
    true;


  try {

    const response =
      await fetch(
        `/api/fixtures?gw=${fixturesGw}&_=${Date.now()}`,
        {
          cache:
            'no-store'
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        'Unable to load fixtures'
      );

    }


    fixturesData =
      data;


    renderFixtures();


  } catch (error) {

    console.error(
      'Fixtures load failed:',
      error
    );


    if ($('fixturesBody')) {

      $('fixturesBody').innerHTML = `
        <div class="empty">
          ${escapeHtml(error.message)}
        </div>
      `;

    }

  } finally {

    fixturesLoading =
      false;

  }

}


function anyFixtureStillLive() {

  return !!(
    fixturesGw === getCurrentGw() &&
    fixturesData &&
    Array.isArray(fixturesData.fixtures) &&
    fixturesData.fixtures.some(
      fixture => fixture.status === 'live'
    )
  );

}


/*
  A circular crest badge. Renders the real club badge when the
  backend resolved one (the Premier League's own badge CDN, built
  from each team's FPL "code" - see api/fixtures.js); otherwise
  (and if the image ever fails to load) falls back to a plain
  short-code badge, so a missing/broken logo never leaves a blank
  hole in the layout.
*/

function teamCrest(code, size, logoUrl) {

  const sizeClass =
    `team-crest-${size || 'sm'}`;

  const fallback =
    `<span class="team-crest-fallback" ${logoUrl ? 'style="display:none;"' : ''}>${escapeHtml(code)}</span>`;

  const img =
    logoUrl
      ? `
        <img
          class="team-crest-img"
          src="${escapeHtml(logoUrl)}"
          alt="${escapeHtml(code)}"
          loading="lazy"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='';"
        >
      `
      : '';

  return `<span class="team-crest ${sizeClass}">${img}${fallback}</span>`;

}


function fixtureRow(fixture) {

  const kickoff =
    fixture.kickoff
      ? new Date(fixture.kickoff)
      : null;


  const kickoffLabel =
    kickoff
      ? kickoff.toLocaleString(
          undefined,
          {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
          }
        )
      : 'TBC';


  const statusBadge =
    fixture.status === 'live'
      ? '<span class="fixture-status live">LIVE</span>'
      : fixture.status === 'final'
        ? '<span class="fixture-status final">FT</span>'
        : `<span class="fixture-status upcoming">${escapeHtml(kickoffLabel)}</span>`;


  const showScore =
    fixture.status !== 'upcoming';


  return `
    <div class="fixture-row" data-fixture-id="${fixture.id}">

      <div class="fixture-team fixture-team-home">
        ${teamCrest(fixture.homeTeam, 'md', fixture.homeCrest)}
      </div>

      <div class="fixture-score">
        ${
          showScore
            ? `${fixture.homeScore} - ${fixture.awayScore}`
            : 'vs'
        }
      </div>

      <div class="fixture-team fixture-team-away">
        ${teamCrest(fixture.awayTeam, 'md', fixture.awayCrest)}
      </div>

      ${statusBadge}

    </div>
  `;

}


function renderFixtures() {

  if (!$('fixturesBody')) {
    return;
  }


  buildFixturesGwSelect();


  const gw =
    fixturesGw ?? getCurrentGw();


  if ($('fixturesSubtitle')) {

    $('fixturesSubtitle').textContent =
      `Gameweek ${gw} Premier League matches.`;

  }


  if (
    fixturesLoading &&
    (!fixturesData || fixturesData.gw !== gw)
  ) {

    $('fixturesBody').innerHTML = `
      <div class="empty">
        Loading fixtures…
      </div>
    `;

    return;

  }


  if (
    !fixturesData ||
    fixturesData.gw !== gw
  ) {

    if (
      !fixturesLoading &&
      dashboardData
    ) {

      loadFixturesData(gw);

    }

    return;

  }


  const fixtures =
    Array.isArray(fixturesData.fixtures)
      ? fixturesData.fixtures
      : [];


  if (!fixtures.length) {

    $('fixturesBody').innerHTML = `
      <div class="empty">
        No fixtures found for this Gameweek.
      </div>
    `;

    return;

  }


  $('fixturesBody').innerHTML =
    fixtures
      .map(fixtureRow)
      .join('');

}


/* =====================================================
   FIXTURE DETAIL SHEET (tap a match)
===================================================== */

function findFixture(fixtureId) {

  return (
    (fixturesData?.fixtures || []).find(
      fixture => Number(fixture.id) === Number(fixtureId)
    ) || null
  );

}


function openFixtureDetail(fixtureId) {

  const fixture =
    findFixture(fixtureId);

  if (!fixture || !$('fixtureSheet')) {
    return;
  }

  activeFixtureId =
    fixtureId;

  $('fixtureDetailBody').innerHTML =
    buildFixtureDetailHtml(fixture);

  $('fixtureSheet').hidden =
    false;

}


function closeFixtureDetail() {

  if ($('fixtureSheet')) {
    $('fixtureSheet').hidden = true;
  }

  activeFixtureId =
    null;

}


/*
  PL-style scorer column. Scorer name leads every line, with the
  assist (when known) directly underneath it in small italics -
  that pairing is the "who scored, who set it up" read a match
  card is meant to give at a glance, rather than two separate
  unlinked lists.

  FPL's own API is aggregate-count-only - no per-goal minute and
  no real pairing, just "these players scored N times" and "these
  players assisted" as two unlinked lists. A 1:1 scorer <-> assist
  pairing is only ever printed when it's actually unambiguous
  (exactly one scorer, exactly one goal, exactly one assist for
  that side) - anything else (a brace, multiple scorers) falls
  back to a scorer list (⚽ repeated per goal) plus one combined
  assist line, rather than guessing a pairing that isn't really
  known.
*/

function goalAssistLines(events, teamKey) {

  const scorers =
    (events?.scorers || []).filter(entry => entry.team === teamKey);

  const assists =
    (events?.assists || []).filter(entry => entry.team === teamKey);

  const unambiguousPair =
    scorers.length === 1 &&
    scorers[0].value === 1 &&
    assists.length === 1;

  if (unambiguousPair) {
    return `
      <p class="match-card-scorer-line">
        <span class="match-card-scorer-name">${escapeHtml(scorers[0].name)}</span>
        <span class="match-card-goal-icons">⚽</span>
      </p>
      <p class="match-card-assist-line">assist: ${escapeHtml(assists[0].name)}</p>
    `;
  }

  const goalLines =
    scorers
      .map(
        entry => `
          <p class="match-card-scorer-line">
            <span class="match-card-scorer-name">${escapeHtml(entry.name)}</span>
            <span class="match-card-goal-icons">${'⚽'.repeat(Math.max(1, entry.value))}</span>
          </p>
        `
      )
      .join('');

  const assistLine =
    assists.length
      ? `<p class="match-card-assist-line">assist: ${assists.map(entry => escapeHtml(entry.name)).join(', ')}</p>`
      : '';

  return `${goalLines}${assistLine}`;

}

function matchCardScorerColumn(events, teamKey, side) {

  const lines =
    goalAssistLines(events, teamKey);

  return `
    <div class="match-card-scorers-col match-card-scorers-${side}">
      ${lines}
    </div>
  `;

}


/*
  Lineups render as a pitch view - same GKP/DEF/MID/FWD row
  layout as the Squad tab's pitch (pitchRows() below), holding
  only the 11 who actually started, each carrying their FPL
  points for the Gameweek (the same figure shown on the Squad
  tab) rather than any substitution timing FPL's API doesn't
  provide. Anyone who came off the bench is listed separately
  underneath, also with their points - so this reads as "who
  actually delivered", not just "who was on the pitch".
*/

function fixtureLineupPlayerCard(player) {

  return `
    <div class="pitch-player">
      <div class="pitch-shirt-wrap">
        <span class="pitch-shirt">👕</span>
      </div>
      <div class="pitch-player-name">
        ${escapeHtml(player.name)}
      </div>
      <div class="pitch-player-points">
        ${Math.round(player.points || 0)}
      </div>
    </div>
  `;

}


function fixtureLineupPitch(teamCode, teamName, crestUrl, players) {

  const starters =
    players.filter(player => player.started !== false);

  const subs =
    players.filter(player => player.started === false);

  const subsSection =
    subs.length
      ? `
        <div class="fixture-subs">
          <p class="fixture-lineup-title">Substitutes used</p>
          <div class="fixture-subs-list">
            ${
              subs
                .map(
                  player => `
                    <div class="fixture-sub-row">
                      <span class="fixture-sub-shirt">👕</span>
                      <span class="fixture-sub-name">${escapeHtml(player.name)}</span>
                      <span class="fixture-sub-points">${Math.round(player.points || 0)}</span>
                    </div>
                  `
                )
                .join('')
            }
          </div>
        </div>
      `
      : '';

  return `
    <div class="fixture-pitch-team">

      <p class="fixture-lineup-title">
        ${teamCrest(teamCode, 'sm', crestUrl)}
        ${escapeHtml(teamName)}
      </p>

      ${
        starters.length
          ? `
            <div class="pitch pitch-compact">
              ${
                pitchRows(starters)
                  .map(
                    row => `
                      <div class="pitch-row">
                        ${row.map(player => fixtureLineupPlayerCard(player)).join('')}
                      </div>
                    `
                  )
                  .join('')
              }
            </div>
          `
          : '<p class="fixture-lineup-empty">No data yet.</p>'
      }

      ${subsSection}

    </div>
  `;

}


function buildFixtureDetailHtml(fixture) {

  const kickoff =
    fixture.kickoff
      ? new Date(fixture.kickoff).toLocaleString(
          undefined,
          {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
          }
        )
      : 'TBC';

  const statusLabel =
    fixture.status === 'live'
      ? 'Live'
      : fixture.status === 'final'
        ? 'Full-time'
        : `Kicks off ${kickoff}`;

  const events =
    fixture.events;

  const homeColumn =
    matchCardScorerColumn(events, 'h', 'home');

  const awayColumn =
    matchCardScorerColumn(events, 'a', 'away');

  const noGoalsYet =
    fixture.status !== 'upcoming' &&
    !(events?.scorers || []).length;

  return `

    <div class="match-card-meta">
      <span class="match-card-meta-league">Premier League</span>
      <span class="match-card-meta-status ${fixture.status === 'live' ? 'live' : ''}">${statusLabel}</span>
    </div>

    <div class="match-card-score-row">

      <div class="match-card-side">
        ${teamCrest(fixture.homeTeam, 'lg', fixture.homeCrest)}
        <span class="match-card-team-name">${escapeHtml(fixture.homeTeamName)}</span>
      </div>

      <div class="match-card-score-value">
        ${
          fixture.status === 'upcoming'
            ? 'vs'
            : `${fixture.homeScore} - ${fixture.awayScore}`
        }
      </div>

      <div class="match-card-side">
        ${teamCrest(fixture.awayTeam, 'lg', fixture.awayCrest)}
        <span class="match-card-team-name">${escapeHtml(fixture.awayTeamName)}</span>
      </div>

    </div>

    ${
      fixture.status === 'upcoming'
        ? `
          <p class="fixture-detail-note" style="text-align:center;">
            Nothing to show yet - check back once kickoff happens.
          </p>
        `
        : noGoalsYet
          ? `
            <p class="fixture-detail-note" style="text-align:center; padding-top:14px; border-top:1px solid var(--border);">
              No goals yet.
            </p>
          `
          : `
            <div class="match-card-scorers">
              ${homeColumn}
              <span class="match-card-ball">⚽</span>
              ${awayColumn}
            </div>
          `
    }

    <div class="section-heading">
      <h3>Lineup</h3>
    </div>

    ${
      fixture.lineups
        ? `
          <p class="fixture-detail-note">
            The 11 who started, plus who came off the bench - each with
            their FPL points for the Gameweek.
          </p>
          ${fixtureLineupPitch(fixture.homeTeam, fixture.homeTeamName, fixture.homeCrest, fixture.lineups.home)}
          ${fixtureLineupPitch(fixture.awayTeam, fixture.awayTeamName, fixture.awayCrest, fixture.lineups.away)}
        `
        : `
          <p class="fixture-detail-note">
            Pending lineup - not yet available.
          </p>
        `
    }

  `;

}


/* =====================================================
   PREDICTIONS TAB
===================================================== */

function renderPredictions() {

  if (!$('predictionsBody')) {
    return;
  }


  if (!gameweekHasStarted()) {

    $('predictionsBody').innerHTML = `
      <div class="feature-card">
        <span class="feature-icon">🔮</span>
        <h2>Waiting for kickoff</h2>
        <p>
          Predictions unlock once GW${getCurrentGw()}'s
          deadline passes and squads are locked in.
        </p>
      </div>
    `;

    return;

  }


  if (
    squadsLoading &&
    !squadsData
  ) {

    $('predictionsBody').innerHTML = `
      <div class="empty">
        Loading predictions…
      </div>
    `;

    return;

  }


  if (!squadsData) {
    return;
  }


  const managers =
    Array.isArray(
      dashboardData?.managers
    )
      ? dashboardData.managers
      : [];


  const rows =
    managers
      .map(
        manager => ({
          manager,
          squad:
            squadFor(
              manager.entryId
            )
        })
      )
      .filter(
        row =>
          row.squad &&
          !row.squad.error
      )
      .sort(
        (a, b) =>
          b.squad.predictedTotal -
          a.squad.predictedTotal
      );


  if (!rows.length) {

    $('predictionsBody').innerHTML = `
      <div class="empty">
        No predictions available yet.
      </div>
    `;

    return;

  }


  const leaderTotal =
    rows[0].squad.predictedTotal;


  const leaders =
    rows.filter(
      row =>
        row.squad.predictedTotal ===
        leaderTotal
    );


  const anyLive =
    rows.some(
      row =>
        row.squad.liveStatus !==
        'upcoming'
    );


  const summary =
    buildAwardCardHTML({
      tone: 'predicted',
      icon: '🔮',
      eyebrow:
        leaders.length > 1
          ? 'PREDICTED LEADERS'
          : 'PREDICTED LEADER',
      tag:
        anyLive
          ? 'UPDATING LIVE'
          : 'PROJECTED',
      winners:
        leaders.map(
          row => ({
            name: row.manager.manager,
            sub: row.manager.team,
            value: `${row.squad.predictedTotal.toFixed(1)} pts`
          })
        ),
      note: predictionReasonText(rows[0].squad)
    });


  const list =
    rows
      .map(
        row =>
          predictionRow(row)
      )
      .join('');


  $('predictionsBody').innerHTML =
    summary + list;

}


function predictionReasonText(squad) {

  const contributors =
    squad.topContributors ||
    [];


  if (!contributors.length) {

    return 'Based on FPL\'s expected points for the locked-in starting XI.';

  }


  const parts =
    contributors
      .map(
        player =>
          `${statusDot(player.status)}${escapeHtml(player.name)}${player.isCaptain ? ' (C)' : ''} ${player.predictedContribution.toFixed(1)}`
      )
      .join(', ');


  return `Driven by ${parts}. Live players use actual points; others use FPL's projection.`;

}


/*
  A tiny colored dot: green = fixture live, grey = fixture
  finished, hollow = fixture yet to kick off. Lets a manager
  see at a glance which of their scores are still "in motion".
*/

function statusDot(status) {

  return `<span class="player-status-dot ${status || 'upcoming'}"></span>`;

}


function predictionRow(row) {

  const squad =
    row.squad;


  const chip =
    squad.activeChipLabel
      ? `<span class="chip-badge">${escapeHtml(squad.activeChipLabel)}</span>`
      : '';


  const statusLabel =
    squad.liveStatus === 'final'
      ? 'FINAL'
      : squad.liveStatus === 'live'
        ? 'LIVE'
        : 'PROJECTED';


  return `
    <div class="standing-row">

      <div class="manager-info">

        <strong>
          ${escapeHtml(row.manager.manager)}
          ${chip}
        </strong>

        <small class="standing-meta">
          ${predictionReasonText(squad)}
        </small>

      </div>


      <div class="points">

        <strong>
          ${squad.predictedTotal.toFixed(1)}
        </strong>

        <small>
          ${statusLabel}
        </small>

      </div>

    </div>
  `;

}


/* =====================================================
   SQUADS TAB
===================================================== */

function renderSquadsTab() {

  if (!$('squadManagerPicker')) {
    return;
  }


  if (!gameweekHasStarted()) {

    $('squadManagerPicker').innerHTML =
      '';

    $('squadDetail').innerHTML = `
      <div class="feature-card">
        <span class="feature-icon">👕</span>
        <h2>Waiting for kickoff</h2>
        <p>
          Squads unlock once GW${getCurrentGw()}'s
          deadline passes.
        </p>
      </div>
    `;

    return;

  }


  if (
    squadsLoading &&
    !squadsData
  ) {

    $('squadDetail').innerHTML = `
      <div class="empty">
        Loading squads…
      </div>
    `;

    return;

  }


  if (!squadsData) {
    return;
  }


  const managers =
    Array.isArray(
      dashboardData?.managers
    )
      ? dashboardData.managers
      : [];


  if ($('squadsSubtitle')) {

    $('squadsSubtitle').textContent =
      `Captain, vice-captain and chips for GW${getCurrentGw()}.`;

  }


  $('squadManagerPicker').innerHTML =
    managers
      .map(
        manager => {

          const squad =
            squadFor(
              manager.entryId
            );


          const active =
            Number(
              selectedSquadEntry
            ) ===
            Number(
              manager.entryId
            );


          return `
            <button
              type="button"
              class="squad-chip ${active ? 'active' : ''}"
              data-entry="${manager.entryId}"
            >
              ${escapeHtml(manager.manager)}
              ${
                squad?.activeChipLabel
                  ? '⚡'
                  : ''
              }
            </button>
          `;

        }
      )
      .join('');


  if ($('compareToggle')) {

    $('compareToggle').classList.toggle(
      'active',
      compareMode
    );

    $('compareToggle').textContent =
      compareMode
        ? '✕ Exit Compare'
        : '⚖️ Compare';

  }


  if ($('comparePickerWrap')) {

    $('comparePickerWrap').hidden =
      !compareMode;

  }


  if (
    compareMode &&
    $('comparePicker')
  ) {

    if (
      compareEntry == null ||
      Number(compareEntry) ===
        Number(selectedSquadEntry)
    ) {

      compareEntry =
        defaultCompareEntry(
          selectedSquadEntry
        );

    }


    $('comparePicker').innerHTML =
      managers
        .filter(
          manager =>
            Number(manager.entryId) !==
            Number(selectedSquadEntry)
        )
        .map(
          manager => `
            <button
              type="button"
              class="squad-chip ${Number(compareEntry) === Number(manager.entryId) ? 'active' : ''}"
              data-compare-entry="${manager.entryId}"
            >
              ${escapeHtml(manager.manager)}
            </button>
          `
        )
        .join('');

  }


  if (compareMode) {

    renderSquadComparison();

  } else {

    renderSelectedSquad();

  }

}


/*
  Defaults the comparison opponent to whoever is ranked
  just above the selected manager in this Gameweek's
  standings (the natural "who do I need to catch?"), or
  just below if the selected manager is already top of
  the table.
*/

function defaultCompareEntry(entryId) {

  const weekly =
    Array.isArray(
      dashboardData?.weekly
    )
      ? dashboardData.weekly
      : [];

  if (weekly.length < 2) {
    return null;
  }


  const index =
    weekly.findIndex(
      manager =>
        Number(manager.entryId) ===
        Number(entryId)
    );

  if (index === -1) {

    return (
      weekly.find(
        manager =>
          Number(manager.entryId) !==
          Number(entryId)
      )?.entryId ??
      null
    );

  }


  const neighbor =
    index > 0
      ? weekly[index - 1]
      : weekly[index + 1];

  return neighbor?.entryId ?? null;

}


/*
  Explains, in plain language, when FPL's own auto-substitution
  and captain/vice-captain fallback rules have kicked in for
  this squad - so the points shown on the pitch below aren't a
  mystery when they don't match the manager's original picks.
*/

function squadRulesNote(squad) {

  const notes = [];

  if (squad.captainFallback) {

    notes.push(
      squad.captainFallback.toName
        ? `🧢 ${escapeHtml(squad.captainFallback.fromName)} didn't play, so the armband (and doubled points) moved to ${escapeHtml(squad.captainFallback.toName)}.`
        : `🧢 Neither ${escapeHtml(squad.captainFallback.fromName)} nor the vice-captain played, so no player's points were doubled this Gameweek.`
    );

  }

  if (
    Array.isArray(squad.autoSubs) &&
    squad.autoSubs.length
  ) {

    notes.push(
      `🔄 Auto-subbed: ${squad.autoSubs.map(sub => `${escapeHtml(sub.inName)} on for ${escapeHtml(sub.outName)}`).join(', ')}.`
    );

  }

  if (!notes.length) {
    return '';
  }

  return `
    <div class="squad-rules-note">
      ${notes.map(note => `<p>${note}</p>`).join('')}
      ${
        squad.autoSubsFinal === false
          ? '<p class="squad-rules-provisional">Provisional until FPL fully checks this Gameweek.</p>'
          : ''
      }
    </div>
  `;

}


function renderSelectedSquad() {

  if (!$('squadDetail')) {
    return;
  }


  const manager =
    (
      dashboardData?.managers ||
      []
    ).find(
      item =>
        Number(
          item.entryId
        ) ===
        Number(
          selectedSquadEntry
        )
    );


  const squad =
    squadFor(
      selectedSquadEntry
    );


  if (
    !manager ||
    !squad
  ) {

    $('squadDetail').innerHTML = `
      <div class="empty">
        Select a manager above.
      </div>
    `;

    return;

  }


  if (squad.error) {

    $('squadDetail').innerHTML = `
      <div class="empty">
        ${escapeHtml(squad.error)}
      </div>
    `;

    return;

  }


  const chip =
    squad.activeChipLabel
      ? `<span class="chip-badge">${escapeHtml(squad.activeChipLabel)}</span>`
      : '';


  const ownership =
    computeLeagueOwnership();


  const totalManagers =
    squadsData.squads.filter(
      s => !s.error
    ).length;


  /*
    Same live GW points shown on the GW standings screen
    (manager.gameweekPoints, FPL's own official live total) -
    NOT the Compare screen's "what if" simulator, which only
    ever touches its own separate scenario state and never
    this figure. LIVE/FINAL mirrors the GW screen's status
    dot logic; while nothing's kicked off yet it just reads
    "GW PTS" like the standings row does.
  */

  const liveLabel =
    squad.liveStatus === 'final'
      ? 'FINAL'
      : squad.liveStatus === 'live'
        ? 'LIVE'
        : 'GW PTS';


  $('squadDetail').innerHTML = `

    <div class="award-card squad-summary-card" style="margin-bottom:18px;">
      <span class="award-icon">👕</span>
      <div class="squad-summary-info">
        <h3>
          ${escapeHtml(manager.manager)}
          ${chip}
        </h3>
        <small>${escapeHtml(manager.team)}</small>
        <p>
          Captain
          ${squad.captain ? escapeHtml(squad.captain.name) : '—'}
          &middot;
          Vice
          ${squad.viceCaptain ? escapeHtml(squad.viceCaptain.name) : '—'}
        </p>
      </div>
      <div class="points">
        <strong>${manager.gameweekPoints ?? '—'}</strong>
        <small>${liveLabel}</small>
      </div>
    </div>

    ${squadRulesNote(squad)}

    <p class="pitch-hint">
      Tap any player to see who else in the league owns them.
    </p>


    <div class="pitch">
      ${
        pitchRows(squad.startingXI)
          .map(
            row => `
              <div class="pitch-row">
                ${
                  row
                    .map(
                      player =>
                        pitchPlayerCard(
                          player,
                          ownership,
                          totalManagers
                        )
                    )
                    .join('')
                }
              </div>
            `
          )
          .join('')
      }
    </div>


    <div class="section-heading">
      <h3>Bench</h3>
    </div>

    <div class="bench-strip">
      ${
        squad.bench
          .map(
            player =>
              pitchPlayerCard(
                player,
                ownership,
                totalManagers
              )
          )
          .join('')
      }
    </div>

  `;

}


/* =====================================================
   SQUAD COMPARISON ("Compare" mode on the Squads tab)

   Head-to-head for the current Gameweek only (squadsData
   never holds a past GW's picks). Points already locked in
   (live or finished players) are always real - FPL's own
   live event points, nothing predictive. Points from a
   player who hasn't started yet are NEVER guessed at with
   an expected-points/form-style stat - instead the user
   picks an explicit scenario for that player (a goal, an
   assist, a clean sheet, a defensive contribution, bonus
   points) and the simulator adds up exactly what the real
   FPL scoring rules award for it. Nothing here is a
   prediction; every number is either already-earned or
   something the person chose to test out.
===================================================== */

/*
  Real FPL point values (2025/26 rules). This is the entire
  scoring engine behind the "what if" simulator - no
  expected-goals/expected-points/form inputs anywhere here.
*/

const GOAL_POINTS = { GKP: 10, DEF: 6, MID: 5, FWD: 4 };
const CLEAN_SHEET_POINTS = { GKP: 4, DEF: 4, MID: 1, FWD: 0 };
const ASSIST_POINTS = 3;
const DEFENSIVE_CONTRIBUTION_POINTS = 2;
const APPEARANCE_POINTS = { none: 0, sub: 1, full: 2 };

function cleanSheetEligible(position) {
  return position !== 'FWD';
}

function defensiveContributionEligible(position) {
  return position === 'DEF' || position === 'MID' || position === 'FWD';
}

function emptyScenario() {
  return {
    appearance: 'full',
    goals: 0,
    assists: 0,
    cleanSheet: false,
    defCon: false,
    bonus: 0
  };
}

/*
  A scenario only "counts" once it differs from the
  untouched default (assumed to play 60+ minutes, nothing
  else) - so opening the sheet and closing it again without
  changing anything never adds phantom points anywhere.
*/

function isScenarioMeaningful(scenario) {
  return !!scenario && (
    scenario.appearance !== 'full' ||
    scenario.goals > 0 ||
    scenario.assists > 0 ||
    scenario.cleanSheet ||
    scenario.defCon ||
    scenario.bonus > 0
  );
}

function scenarioRawPoints(position, scenario) {

  if (!scenario) {
    return 0;
  }

  const goalValue = GOAL_POINTS[position] || GOAL_POINTS.FWD;
  const csValue = CLEAN_SHEET_POINTS[position] ?? 0;

  return (
    (APPEARANCE_POINTS[scenario.appearance] ?? 0) +
    scenario.goals * goalValue +
    scenario.assists * ASSIST_POINTS +
    (scenario.cleanSheet ? csValue : 0) +
    (scenario.defCon ? DEFENSIVE_CONTRIBUTION_POINTS : 0) +
    scenario.bonus
  );

}

/*
  Scenarios are keyed by the real player alone, not by which
  manager's squad you tapped them from - a goal is the same
  goal no matter whose team you're viewing. That's what lets
  a player owned by BOTH sides of a comparison get simulated
  once and have it apply everywhere they're counted, instead
  of the person having to set the same scenario up twice.
  Each side's own captain/chip multiplier is still applied
  separately in sumScenarioPoints below, since that genuinely
  does differ per squad.
*/

function scenarioKey(playerId) {
  return String(playerId);
}

/*
  Total simulated points a side's still-to-play players
  would add, counting only players someone has actually set
  a scenario for (captain/chip multiplier applied, same as
  everywhere else in the app).
*/

function sumScenarioPoints(players) {

  return players.reduce(
    (sum, player) => {

      const scenario =
        compareScenarios[scenarioKey(player.id)];

      if (!isScenarioMeaningful(scenario)) {
        return sum;
      }

      return (
        sum +
        scenarioRawPoints(player.position, scenario) *
          (player.multiplier || 1)
      );

    },
    0
  );

}

/*
  Splits a squad's counting players (Starting XI, plus the
  bench too if Bench Boost is active) into what's already
  locked in (live or finished - real points) vs what's
  still to play.
*/

function squadCompareBreakdown(squad) {

  const counting =
    [
      ...(squad.startingXI || []),
      ...(
        squad.activeChip === 'bboost'
          ? (squad.bench || [])
          : []
      )
    ].filter(
      player => player.multiplier > 0
    );

  const toPlay =
    counting.filter(
      player => player.status === 'upcoming'
    );

  const locked =
    counting.filter(
      player => player.status !== 'upcoming'
    );

  /*
    predictedContribution for a LOCKED player is always real -
    api/squads.js only falls back to FPL's projection for a
    player whose match hasn't started yet, and by definition
    every player here has (status is 'live' or 'final').
  */
  const lockedPoints =
    locked.reduce(
      (sum, player) =>
        sum + (player.predictedContribution || 0),
      0
    );

  return {
    counting,
    locked,
    toPlay,
    lockedPoints
  };

}


function weeklyRankFor(entryId) {

  const weekly =
    Array.isArray(
      dashboardData?.weekly
    )
      ? dashboardData.weekly
      : [];

  const index =
    weekly.findIndex(
      manager =>
        Number(manager.entryId) ===
        Number(entryId)
    );

  return index === -1 ? null : index + 1;

}


function ordinal(n) {

  if (!Number.isInteger(n)) {
    return '';
  }


  const remainder100 =
    n % 100;

  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${n}th`;
  }


  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }

}


/*
  One compact line per still-to-play player. No projected/
  expected-points number is ever shown here - only an
  injury-doubt flag (FPL's own doubt on whether they'll even
  feature) and, once the person has tapped in a scenario for
  this player, the real points that scenario is worth.
*/

function comparePlayerRow(player, entryId, isShared) {

  const scenario =
    compareScenarios[scenarioKey(player.id)];

  const meaningful =
    isScenarioMeaningful(scenario);

  const simPoints =
    meaningful
      ? Math.round(
          scenarioRawPoints(player.position, scenario) *
            (player.multiplier || 1)
        )
      : null;

  const doubt =
    player.chanceOfPlaying != null &&
    player.chanceOfPlaying < 75
      ? `<span class="compare-doubt">⚠ ${player.chanceOfPlaying}% chance</span>`
      : '';

  /*
    Owned by both sides - flagging this makes it obvious why
    simulating them once is enough (no need to repeat it on
    the other side's list).
  */
  const sharedTag =
    isShared
      ? '<span class="compare-shared-tag">↔ both squads</span>'
      : '';

  return `
    <div
      class="compare-player-row"
      data-scenario-entry="${entryId}"
      data-scenario-player="${player.id}"
    >

      <div class="compare-player-name">
        ${statusDot(player.status)}
        ${escapeHtml(player.name)}
        ${player.isCaptain ? '<span class="pitch-armband-inline">C</span>' : ''}
        <small>${escapeHtml(player.team)} &middot; ${escapeHtml(player.position)} ${sharedTag}</small>
      </div>

      <div class="compare-player-stats">
        ${
          meaningful
            ? `<strong class="compare-sim-applied">${simPoints} pts if this happens</strong>`
            : `<strong class="compare-sim-cta">🎯 What if?</strong>`
        }
        ${doubt}
      </div>

    </div>
  `;

}


function compareSideSummary(label, manager, breakdown, simulated) {

  const rank =
    weeklyRankFor(manager.entryId);

  const total =
    breakdown.lockedPoints + (simulated || 0);

  return `
    <div class="compare-side-summary">

      <p class="compare-side-label">
        ${label}
        ${
          rank
            ? `<span class="compare-side-rank">${ordinal(rank)}</span>`
            : ''
        }
      </p>

      <strong class="compare-side-name">
        ${escapeHtml(manager.manager)}
      </strong>

      <small>${escapeHtml(manager.team)}</small>

      <div class="compare-side-points">
        <strong>${Math.round(total)}</strong>
        <small>${simulated ? 'pts incl. simulated' : 'pts locked in'}</small>
      </div>

      <p class="compare-side-detail">
        ${breakdown.lockedPoints.toFixed(0)} locked in
        ${simulated ? ` &middot; +${Math.round(simulated)} simulated` : ''}
        &middot;
        ${
          breakdown.toPlay.length
            ? `${breakdown.toPlay.length} still to play`
            : 'nobody left to play'
        }
      </p>

    </div>
  `;

}


function renderSquadComparison() {

  if (!$('squadDetail')) {
    return;
  }


  const managers =
    dashboardData?.managers ||
    [];


  const myManager =
    managers.find(
      item =>
        Number(item.entryId) ===
        Number(selectedSquadEntry)
    );

  const theirManager =
    managers.find(
      item =>
        Number(item.entryId) ===
        Number(compareEntry)
    );

  const mySquad =
    squadFor(selectedSquadEntry);

  const theirSquad =
    compareEntry
      ? squadFor(compareEntry)
      : null;


  if (
    !myManager ||
    !mySquad ||
    mySquad.error
  ) {

    $('squadDetail').innerHTML = `
      <div class="empty">
        Select a manager above.
      </div>
    `;

    return;

  }


  if (
    !theirManager ||
    !theirSquad ||
    theirSquad.error
  ) {

    $('squadDetail').innerHTML = `
      <div class="empty">
        Pick someone to compare with above.
      </div>
    `;

    return;

  }


  const mine =
    squadCompareBreakdown(mySquad);

  const theirs =
    squadCompareBreakdown(theirSquad);


  const mySimulated =
    sumScenarioPoints(mine.toPlay);

  const theirSimulated =
    sumScenarioPoints(theirs.toPlay);

  const myTotal =
    mine.lockedPoints + mySimulated;

  const theirTotal =
    theirs.lockedPoints + theirSimulated;

  const gap =
    theirTotal - myTotal;

  const anyoneStillToPlay =
    mine.toPlay.length > 0 ||
    theirs.toPlay.length > 0;

  const anyScenarioApplied =
    mine.toPlay.some(
      player =>
        isScenarioMeaningful(
          compareScenarios[scenarioKey(player.id)]
        )
    ) ||
    theirs.toPlay.some(
      player =>
        isScenarioMeaningful(
          compareScenarios[scenarioKey(player.id)]
        )
    );

  /*
    Players both squads happen to own, still to play on both
    sides - simulating one of these applies everywhere it's
    counted (see scenarioKey), so flag them in the lists below
    rather than making the person re-enter the same scenario
    twice.
  */
  const theirToPlayIds =
    new Set(theirs.toPlay.map(player => Number(player.id)));

  const myToPlayIds =
    new Set(mine.toPlay.map(player => Number(player.id)));


  /*
    Three distinct framings, none of them a prediction:
    - Nobody left to play -> this IS the final result.
    - Someone's still to play, nothing simulated yet -> just
      report the real, already-locked-in gap and invite the
      person to tap a player and simulate something.
    - Someone's still to play, and a scenario's been set ->
      report what THAT scenario (their choice, not ours)
      would mean.
  */

  let verdict;
  let icon;

  if (!anyoneStillToPlay) {

    icon =
      Math.abs(gap) < 0.05 ? '🤝' : gap < 0 ? '🏆' : '⚔️';

    verdict =
      Math.abs(gap) < 0.05
        ? `It's final - you and ${escapeHtml(theirManager.manager)} finish level on ${Math.round(myTotal)} pts.`
        : gap < 0
          ? `Final result: you beat ${escapeHtml(theirManager.manager)} by ${Math.round(Math.abs(gap))} pts.`
          : `Final result: ${escapeHtml(theirManager.manager)} beat you by ${Math.round(gap)} pts.`;

  } else if (!anyScenarioApplied) {

    icon = '🧮';

    const lockedGap =
      theirs.lockedPoints - mine.lockedPoints;

    verdict =
      Math.abs(lockedGap) < 0.05
        ? `Locked in, you're level with ${escapeHtml(theirManager.manager)}. You have ${mine.toPlay.length} player${mine.toPlay.length === 1 ? '' : 's'} left to play, they have ${theirs.toPlay.length}. Tap a player below to simulate a goal, assist, clean sheet, defensive contribution, or bonus.`
        : lockedGap < 0
          ? `Locked in, you're ${Math.round(Math.abs(lockedGap))} pts ahead of ${escapeHtml(theirManager.manager)} - ${mine.toPlay.length} of your players and ${theirs.toPlay.length} of theirs are still to play. Tap a player below to simulate what happens next.`
          : `Locked in, ${escapeHtml(theirManager.manager)} is ${Math.round(lockedGap)} pts ahead - ${mine.toPlay.length} of your players and ${theirs.toPlay.length} of theirs are still to play. Tap a player below to simulate what happens next.`;

  } else {

    icon =
      gap <= 0 ? '📈' : '⚔️';

    verdict =
      Math.abs(gap) < 0.05
        ? `If this plays out, you and ${escapeHtml(theirManager.manager)} finish level.`
        : gap < 0
          ? `If this plays out, you finish ${Math.round(Math.abs(gap))} pts ahead of ${escapeHtml(theirManager.manager)}.`
          : `If this plays out, ${escapeHtml(theirManager.manager)} finishes ${Math.round(gap)} pts ahead of you.`;

  }


  $('squadDetail').innerHTML = `

    <div class="compare-verdict-card">
      <span class="compare-verdict-icon">
        ${icon}
      </span>
      <p>${verdict}</p>
    </div>

    <div class="compare-sides">
      ${compareSideSummary('YOU', myManager, mine, mySimulated)}
      ${compareSideSummary('THEM', theirManager, theirs, theirSimulated)}
    </div>

    ${
      mine.toPlay.length
        ? `
          <div class="section-heading">
            <h3>Your remaining players</h3>
          </div>
          <div class="compare-player-list">
            ${mine.toPlay.map(player => comparePlayerRow(player, selectedSquadEntry, theirToPlayIds.has(Number(player.id)))).join('')}
          </div>
        `
        : ''
    }

    ${
      theirs.toPlay.length
        ? `
          <div class="section-heading">
            <h3>${escapeHtml(theirManager.manager)}'s remaining players</h3>
          </div>
          <div class="compare-player-list">
            ${theirs.toPlay.map(player => comparePlayerRow(player, compareEntry, myToPlayIds.has(Number(player.id)))).join('')}
          </div>
        `
        : ''
    }

    ${
      anyScenarioApplied
        ? `
          <button type="button" class="scenario-reset-all" data-reset-all-scenarios>
            ↺ Reset all simulations
          </button>
        `
        : ''
    }

  `;

}


/* =====================================================
   "WHAT IF" SCENARIO SHEET

   A bottom sheet (same chrome as the player-ownership
   sheet) for one still-to-play player at a time. Every
   control is an explicit, real FPL scoring category the
   person picks themselves - minutes played, goals,
   assists, clean sheet, defensive contribution, bonus -
   and the sheet just adds up what the official rules pay
   for that combination. There is no expected-goals, form,
   or projection input anywhere in here.
===================================================== */

function findSquadPlayer(entryId, playerId) {

  const squad =
    squadFor(entryId);

  if (!squad) {
    return null;
  }

  return (
    [
      ...(squad.startingXI || []),
      ...(squad.bench || [])
    ].find(
      player =>
        Number(player.id) === Number(playerId)
    ) || null
  );

}


function openScenarioSheet(entryId, playerId) {

  const player =
    findSquadPlayer(entryId, playerId);

  if (!player || !$('scenarioSheet')) {
    return;
  }

  activeScenarioEntry = entryId;
  activeScenarioPlayerId = playerId;

  renderScenarioSheet();

  $('scenarioSheet').hidden = false;

}


function closeScenarioSheet() {

  if ($('scenarioSheet')) {
    $('scenarioSheet').hidden = true;
  }

  activeScenarioEntry = null;
  activeScenarioPlayerId = null;

}


function activeScenarioKey() {

  return activeScenarioPlayerId != null
    ? scenarioKey(activeScenarioPlayerId)
    : null;

}


function ensureActiveScenario() {

  const key =
    activeScenarioKey();

  if (!key) {
    return null;
  }

  if (!compareScenarios[key]) {
    compareScenarios[key] = emptyScenario();
  }

  return key;

}


function setScenarioField(field, value) {

  const key =
    ensureActiveScenario();

  if (!key) {
    return;
  }

  compareScenarios[key][field] = value;

  renderScenarioSheet();
  renderSquadComparison();

}


function stepScenarioField(field, delta) {

  const key =
    ensureActiveScenario();

  if (!key) {
    return;
  }

  const max =
    field === 'assists' || field === 'bonus'
      ? 3
      : 5;

  compareScenarios[key][field] =
    Math.max(
      0,
      Math.min(
        max,
        (compareScenarios[key][field] || 0) + delta
      )
    );

  renderScenarioSheet();
  renderSquadComparison();

}


function toggleScenarioField(field) {

  const key =
    ensureActiveScenario();

  if (!key) {
    return;
  }

  compareScenarios[key][field] =
    !compareScenarios[key][field];

  renderScenarioSheet();
  renderSquadComparison();

}


function resetActiveScenario() {

  const key =
    activeScenarioKey();

  if (key) {
    delete compareScenarios[key];
  }

  renderScenarioSheet();
  renderSquadComparison();

}


function renderScenarioSheet() {

  if (
    !$('scenarioBody') ||
    activeScenarioEntry == null ||
    activeScenarioPlayerId == null
  ) {
    return;
  }

  const player =
    findSquadPlayer(activeScenarioEntry, activeScenarioPlayerId);

  if (!player) {
    closeScenarioSheet();
    return;
  }

  const scenario =
    compareScenarios[scenarioKey(activeScenarioPlayerId)] ||
    emptyScenario();

  $('scenarioBody').innerHTML =
    buildScenarioSheetHtml(player, scenario);

}


function scenarioSegment(field, value, current, label) {

  return `
    <button
      type="button"
      class="scenario-segment ${current === value ? 'active' : ''}"
      data-scenario-field="${field}"
      data-value="${value}"
    >
      ${label}
    </button>
  `;

}


function scenarioStepper(field, value, label) {

  return `
    <div class="scenario-control-group">
      <p class="scenario-control-label">${label}</p>
      <div class="scenario-stepper" data-scenario-field="${field}">
        <button type="button" class="scenario-step" data-step="-1">−</button>
        <strong>${value}${field === 'goals' && value >= 3 ? ' 🎩' : ''}</strong>
        <button type="button" class="scenario-step" data-step="1">+</button>
      </div>
    </div>
  `;

}


function buildScenarioSheetHtml(player, scenario) {

  const goalValue =
    GOAL_POINTS[player.position] || GOAL_POINTS.FWD;

  const csValue =
    CLEAN_SHEET_POINTS[player.position] ?? 0;

  const raw =
    scenarioRawPoints(player.position, scenario);

  const multiplier =
    player.multiplier || 1;

  const final =
    Math.round(raw * multiplier);

  return `

    <div class="scenario-sheet-header">
      <h3>
        ${escapeHtml(player.name)}
        ${player.isCaptain ? '<span class="pitch-armband-inline">C</span>' : ''}
      </h3>
      <small>
        ${escapeHtml(player.team)} &middot; ${escapeHtml(player.position)}
        ${multiplier > 1 ? ` &middot; captain - points ×${multiplier}` : ''}
      </small>
    </div>

    <p class="scenario-season-note">
      This season: ${player.goals}G ${player.assists}A &middot;
      ${player.cleanSheets} clean sheet${player.cleanSheets === 1 ? '' : 's'} &middot;
      ${player.bonus} bonus pts
    </p>

    <div class="scenario-control-group">
      <p class="scenario-control-label">Minutes played</p>
      <div class="scenario-segmented" data-scenario-field="appearance">
        ${scenarioSegment('appearance', 'none', scenario.appearance, "Didn't play")}
        ${scenarioSegment('appearance', 'sub', scenario.appearance, 'Sub (1pt)')}
        ${scenarioSegment('appearance', 'full', scenario.appearance, '60+ mins (2pts)')}
      </div>
    </div>

    ${scenarioStepper('goals', scenario.goals, `Goals (${goalValue} pts each for a ${escapeHtml(player.position)})`)}

    ${scenarioStepper('assists', scenario.assists, `Assists (${ASSIST_POINTS} pts each)`)}

    ${
      cleanSheetEligible(player.position)
        ? `
          <div class="scenario-control-group">
            <p class="scenario-control-label">Clean sheet (${csValue} pts)</p>
            <button
              type="button"
              class="scenario-toggle ${scenario.cleanSheet ? 'active' : ''}"
              data-scenario-field="cleanSheet"
            >
              ${scenario.cleanSheet ? '✓ Yes' : 'No'}
            </button>
          </div>
        `
        : ''
    }

    ${
      defensiveContributionEligible(player.position)
        ? `
          <div class="scenario-control-group">
            <p class="scenario-control-label">
              Defensive contribution (${DEFENSIVE_CONTRIBUTION_POINTS} pts)
            </p>
            <button
              type="button"
              class="scenario-toggle ${scenario.defCon ? 'active' : ''}"
              data-scenario-field="defCon"
            >
              ${scenario.defCon ? '✓ Yes' : 'No'}
            </button>
            <small>
              ${player.position === 'DEF' ? '10+ tackles/interceptions/clearances/blocks' : '12+ of the above plus recoveries'}
            </small>
          </div>
        `
        : ''
    }

    ${scenarioStepper('bonus', scenario.bonus, 'Bonus points')}

    <div class="scenario-total">
      <span>Real points if this happens</span>
      <strong>
        ${final}
        ${multiplier > 1 ? ` <small>(${raw} × ${multiplier})</small>` : ''}
      </strong>
    </div>

    <button type="button" class="scenario-reset" data-scenario-reset>
      Reset this player
    </button>

  `;

}


/*
  Groups the Starting XI into pitch rows, ordered GKP
  at the top of the screen down to FWD at the bottom.
*/

function pitchRows(startingXI) {

  const order =
    ['GKP', 'DEF', 'MID', 'FWD'];


  return order
    .map(
      position =>
        startingXI.filter(
          player =>
            player.position === position
        )
    )
    .filter(
      row => row.length
    );

}


function pitchPlayerCard(
  player,
  ownership,
  totalManagers
) {

  const armband =
    player.isCaptain
      ? 'C'
      : player.isViceCaptain
        ? 'V'
        : null;


  const isUpcoming =
    (player.status || 'upcoming') === 'upcoming';


  const owned =
    ownership.get(
      player.id
    );


  const ownershipText =
    owned && totalManagers
      ? `👥 ${owned.ownerCount}/${totalManagers}`
      : '';


  /*
    player.multiplier already reflects the captaincy/chip
    math FPL applies (1 for a normal starter, 2 for the
    captain, 3 if Triple Captain is active, 0 for a bench
    spot with no Bench Boost, 1 for a bench spot WITH Bench
    Boost) - so the points shown here should be the raw
    live points times that multiplier, EXCEPT a benched
    player with a 0 multiplier still shows their raw score
    (informational - it just isn't counting toward the
    team total).
  */

  const multiplier =
    Number(player.multiplier || 0);

  const displayPoints =
    player.onBench && multiplier === 0
      ? Math.round(player.livePoints || 0)
      : Math.round(
          (player.livePoints || 0) * (multiplier || 1)
        );

  const multiplierTag =
    !isUpcoming && multiplier > 1
      ? `<span class="pitch-player-multiplier">×${multiplier}</span>`
      : '';


  const subTag =
    player.substitutedOut
      ? '<span class="pitch-sub-tag out">SUBBED OFF</span>'
      : player.substitutedIn
        ? '<span class="pitch-sub-tag in">AUTO-SUBBED IN</span>'
        : '';


  return `
    <div
      class="pitch-player ${player.substitutedOut ? 'subbed-off' : ''}"
      data-player-id="${player.id}"
    >

      <div class="pitch-shirt-wrap">

        <span class="pitch-shirt">👕</span>

        ${
          armband
            ? `<span class="pitch-armband">${armband}</span>`
            : ''
        }

        ${statusDot(player.status)}

      </div>

      <div class="pitch-player-name">
        ${escapeHtml(player.name)}
      </div>

      ${subTag}

      <div class="pitch-player-points ${isUpcoming ? 'pending' : ''}">
        ${
          isUpcoming
            ? 'Not played yet'
            : `${displayPoints}${multiplierTag}`
        }
      </div>

      ${
        ownershipText
          ? `<div class="pitch-player-ownership">${ownershipText}</div>`
          : ''
      }

    </div>
  `;

}


/* =====================================================
   PLAYER OWNERSHIP SHEET (tap a player to see who else
   in the league owns them)
===================================================== */

function openPlayerInfo(playerId) {

  if (!$('playerInfoSheet')) {
    return;
  }


  const ownership =
    computeLeagueOwnership();


  const entry =
    ownership.get(
      Number(playerId)
    );


  if (!entry) {
    return;
  }


  const totalManagers =
    squadsData &&
    Array.isArray(
      squadsData.squads
    )
      ? squadsData.squads.filter(
          squad => !squad.error
        ).length
      : entry.ownerCount;


  if ($('playerInfoBody')) {

    $('playerInfoBody').innerHTML =
      buildPlayerInfoHtml(
        entry,
        totalManagers
      );

  }


  $('playerInfoSheet').hidden =
    false;

}


function closePlayerInfo() {

  if ($('playerInfoSheet')) {

    $('playerInfoSheet').hidden =
      true;

  }

}


function buildPlayerInfoHtml(
  entry,
  totalManagers
) {

  const isUpcoming =
    (entry.status || 'upcoming') === 'upcoming';


  const pointsText =
    isUpcoming
      ? 'Not played yet'
      : `${Math.round(entry.livePoints || 0)} pts live`;


  const owners =
    [...entry.owners].sort(
      (a, b) =>
        a.isCaptain !== b.isCaptain
          ? (a.isCaptain ? -1 : 1)
          : a.manager.localeCompare(b.manager)
    );


  return `
    <div class="player-info-head">

      <h3>
        ${statusDot(entry.status)}${escapeHtml(entry.name)}
      </h3>

      <small>
        ${escapeHtml(entry.team)} &middot; ${escapeHtml(pointsText)}
      </small>

    </div>


    <p class="player-info-owners-title">
      Owned by ${entry.ownerCount}/${totalManagers} managers
    </p>


    <div class="player-info-owners-list">
      ${
        owners
          .map(
            owner => `
              <div class="player-info-owner-row">

                <div>
                  <strong>${escapeHtml(owner.manager)}</strong>
                  <small>${escapeHtml(owner.team)}</small>
                </div>

                ${
                  owner.isCaptain
                    ? '<span class="player-info-owner-tag">C</span>'
                    : ''
                }

              </div>
            `
          )
          .join('')
      }
    </div>
  `;

}


/* =====================================================
   BUILD PUBLIC GW DROPDOWN
===================================================== */

function buildPublicGwSelect() {

  const select =
    $('publicGwSelect');


  if (
    !select ||
    !dashboardData
  ) {
    return;
  }


  const currentGw =
    getCurrentGw();


  select.innerHTML =
    '';


  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {

    const option =
      document.createElement(
        'option'
      );


    option.value =
      String(gw);


    option.textContent =
      gw === currentGw
        ? `GW ${gw} — Current`
        : `GW ${gw}`;


    select.appendChild(
      option
    );

  }


  select.value =
    String(
      selectedGw
    );

}


/* =====================================================
   LOAD A SPECIFIC GW FROM FPL
===================================================== */

async function loadGameweekView(
  gw,
  options = {}
) {

  if (!dashboardData) {
    return;
  }


  const {
    updateHistory = false
  } = options;


  const currentGw =
    getCurrentGw();


  /*
    Never allow a future GW from the selector/URL.
  */

  if (
    !Number.isInteger(gw) ||
    gw < 1 ||
    gw > currentGw
  ) {

    gw =
      currentGw;

  }


  selectedGw =
    gw;


  if ($('publicGwSelect')) {

    $('publicGwSelect')
      .value =
        String(gw);

  }


  if ($('weeklyList')) {

    $('weeklyList')
      .innerHTML = `
        <div class="empty">
          Loading GW${gw} results…
        </div>
      `;

  }


  try {

    /*
      If viewing the current GW,
      we already have the data.
    */

    if (
      gw === currentGw
    ) {

      gwViewData =
        dashboardData;

    } else {

      const response =
        await fetch(
          `/api/dashboard?leagueId=${LEAGUE_ID}&gw=${gw}&_=${Date.now()}`,
          {
            cache:
              'no-store'
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ||
          `Unable to load GW${gw}`
        );

      }


      gwViewData =
        data;

    }


    renderGameweekView();


    if (updateHistory) {

      updateUrl(
        'gameweek',
        gw,
        true
      );

    }


  } catch (error) {

    console.error(
      'GW load failed:',
      error
    );


    if ($('weeklyList')) {

      $('weeklyList')
        .innerHTML = `
          <div class="empty">
            ${escapeHtml(error.message)}
          </div>
        `;

    }

  }

}


/* =====================================================
   RENDER SELECTED GW
===================================================== */

function renderGameweekView() {

  if (!gwViewData) {
    return;
  }


  const data =
    gwViewData;


  const weekly =
    Array.isArray(
      data.weekly
    )
      ? data.weekly
      : [];


  const gw =
    Number(
      data.gameweek
        ?.id ||
      selectedGw
  );


  if ($('gw')) {

    $('gw')
      .textContent =
        gw;

  }


  if ($('statusCode')) {

    $('statusCode')
      .textContent =
        data.gameweek
          ?.status
          ?.code ||
        '—';

  }


  if ($('statusText')) {

    $('statusText')
      .textContent =
        data.gameweek
          ?.status
          ?.label ||
        '';

  }


  if ($('gwStandingsSubtitle')) {

    $('gwStandingsSubtitle')
      .textContent =
        `GW${gw} points only.`;

  }


  if ($('weeklyList')) {

    $('weeklyList')
      .innerHTML =
        weekly.length
          ? weekly
              .map(
                (manager, index) =>
                  standingsRow(
                    manager,
                    index,
                    true
                  )
              )
              .join('')
          : `
            <div class="empty">
              No GW${gw} points available.
            </div>
          `;

  }


  renderGameweekAward();

}


/* =====================================================
   SELECTED GW AWARD
===================================================== */

function renderGameweekAward() {

  if (!gwViewData) {
    return;
  }


  const data =
    gwViewData;


  const status =
    data.gameweek
      ?.status;


  const gw =
    data.gameweek
      ?.id ||
    selectedGw;


  /*
    League ownership/captaincy stats only exist for the
    CURRENT Gameweek (squadsData never holds a past GW's
    picks) - show the card only while viewing that GW,
    and clear it otherwise so a stale current-GW stat
    doesn't linger while browsing history.
  */

  if (gw === getCurrentGw()) {

    renderLeaguePicksCard();

  } else if ($('leaguePicksCard')) {

    $('leaguePicksCard').innerHTML =
      '';

  }


  /*
    Before GW starts
  */

  if (
    status?.code ===
    'PRE-SEASON'
  ) {

    setAwardCard(
      buildAwardCardHTML({
        tone: 'muted',
        icon: '⏳',
        eyebrow: 'WAITING FOR GAMEWEEK',
        tag: null,
        winners: [],
        note: `GW${gw} has not started yet.`
      })
    );

    return;

  }


  /*
    Final GW
  */

  if (
    status?.final
  ) {

    const winners =
      data.awards
        ?.winners ||
      [];


    setAwardCard(
      buildAwardCardHTML({
        tone: 'final',
        icon: '🏆',
        eyebrow:
          winners.length > 1
            ? 'OFFICIAL GW WINNERS'
            : 'OFFICIAL GW WINNER',
        tag: 'FINAL',
        winners:
          winners.map(
            winner => ({
              name: winner.manager,
              sub: winner.team,
              value: `${winner.gameweekPoints} pts`
            })
          ),
        note: `Final GW${gw} result after FPL checks.`
      })
    );

    return;

  }


  /*
    Live / processing

    Before any real points have landed (right after
    the deadline, before the first kickoff), every
    manager is tied at 0 - the Gameweek Standings
    table below already shows that, so there's no
    separate "predicted winner" card here. (The
    projected leader still lives on the Predict tab,
    where it belongs.)
  */

  const leaders =
    data.awards
      ?.provisionalLeader ||
    [];


  const noRealPointsYet =
    leaders.length > 0 &&
    (leaders[0].gameweekPoints || 0) === 0;


  if (noRealPointsYet) {

    setAwardCard(
      buildAwardCardHTML({
        tone: 'muted',
        icon: '⏱️',
        eyebrow: 'GAMEWEEK UNDERWAY',
        tag: null,
        winners: [],
        note: `Real points for GW${gw} haven't landed yet - the standings below will move once matches kick off. See the Predict tab for an early projected leader.`
      })
    );

    return;

  }


  setAwardCard(
    buildAwardCardHTML({
      tone: 'live',
      icon: '👑',
      eyebrow:
        leaders.length > 1
          ? 'PROVISIONAL LEADERS'
          : 'PROVISIONAL LEADER',
      tag: 'LIVE',
      winners:
        leaders.map(
          leader => ({
            name: leader.manager,
            sub: leader.team,
            value: `${leader.gameweekPoints} pts`
          })
        ),
      note: 'Points may still change after bonuses and corrections.'
    })
  );

}


/* =====================================================
   AWARD CARD (shared: Official Winner / Provisional /
   Predicted Leader, all tie-aware)
===================================================== */

function setAwardCard(html) {

  if ($('awardCard')) {

    $('awardCard').innerHTML =
      html;

  }

}


function buildAwardCardHTML({
  tone,
  icon,
  eyebrow,
  tag,
  winners,
  note
}) {

  return `
    <div class="gw-award-card tone-${tone}">

      <div class="gw-award-head">

        <span class="gw-award-icon">${icon}</span>

        <span class="gw-award-eyebrow">
          ${escapeHtml(eyebrow)}
        </span>

        ${
          tag
            ? `<span class="gw-award-tag ${tone}">${escapeHtml(tag)}</span>`
            : ''
        }

      </div>


      ${
        winners.length
          ? `
            <div class="gw-award-winners">
              ${
                winners
                  .map(
                    winner => `
                      <div class="gw-award-winner">
                        <div>
                          <strong>${escapeHtml(winner.name)}</strong>
                          <small>${escapeHtml(winner.sub)}</small>
                        </div>
                        <span class="gw-award-pts">${escapeHtml(winner.value)}</span>
                      </div>
                    `
                  )
                  .join('')
              }
            </div>
          `
          : ''
      }


      <p class="gw-award-note">
        ${note}
      </p>

    </div>
  `;

}


/* =====================================================
   PAYMENT HISTORY
===================================================== */

function renderPaymentHistory() {

  if (
    !dashboardData ||
    !paymentMeta
  ) {
    return;
  }


  if ($('fee')) {

    $('fee')
      .textContent =
        GW_ENTRY_FEE;

  }


  const currentGw =
    getCurrentGw();


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  const requestedTab =
    getRequestedTab();


  const requestedGw =
    requestedTab === 'payments'
      ? getRequestedGw()
      : null;


  const cards =
    [];


  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {

    const zelle =
      zelleForGw(
        gw
      );


    const paidCount =
      managers.filter(
        manager =>
          paidFor(
            gw,
            manager.entryId
          )
      ).length;


    const remaining =
      Math.max(
        0,
        managers.length -
        paidCount
      );


    const winners =
      manualWinnersForGw(
        gw
      );


    const winnerIds =
      new Set(
        winners.map(
          w =>
            Number(w.entryId)
        )
      );


    const shouldOpen =
      requestedGw
        ? gw === requestedGw
        : gw === currentGw;


    const managerRows =
      managers
        .slice()
        .sort(
          (a, b) => {

            const aWinner =
              winnerIds.has(
                Number(a.entryId)
              );


            const bWinner =
              winnerIds.has(
                Number(b.entryId)
              );


            if (
              aWinner !==
              bWinner
            ) {

              return aWinner
                ? -1
                : 1;

            }


            const aPaid =
              paidFor(
                gw,
                a.entryId
              );


            const bPaid =
              paidFor(
                gw,
                b.entryId
              );


            if (
              aPaid !==
              bPaid
            ) {

              return aPaid
                ? 1
                : -1;

            }


            return String(
              a.manager
            ).localeCompare(
              String(
                b.manager
              )
            );

          }
        )
        .map(
          manager => {

            const paid =
              paidFor(
                gw,
                manager.entryId
              );


            const isWinner =
              winnerIds.has(
                Number(manager.entryId)
              );


            return `
              <div
                class="
                  payment-row
                  ${paid ? 'is-paid' : 'is-unpaid'}
                  ${isWinner ? 'is-winner' : ''}
                "
              >

                <div class="payment-status">

                  ${
                    isWinner
                      ? '🏆'
                      : paid
                        ? '✓'
                        : '!'
                  }

                </div>


                <div class="manager-info">

                  <strong>
                    ${escapeHtml(manager.manager)}
                  </strong>

                  <small>
                    ${escapeHtml(manager.team)}
                  </small>

                </div>


                <div
                  class="
                    payment-label
                    ${isWinner ? 'winner-label' : ''}
                  "
                >

                  ${
                    isWinner
                      ? 'WINNER'
                      : paid
                        ? 'PAID'
                        : 'NOT PAID'
                  }

                </div>

              </div>
            `;

          }
        )
        .join('');


    cards.push(`
      <details
        class="payment-gw-card"
        data-payment-gw="${gw}"
        ${shouldOpen ? 'open' : ''}
      >

        <summary class="payment-gw-summary">

          <div>

            <strong>
              GW ${gw}
            </strong>


            ${
              gw === currentGw
                ? `
                  <span class="current-chip">
                    CURRENT
                  </span>
                `
                : ''
            }


            <small>
              ${
                winners.length
                  ? `🏆 ${winners.map(w => escapeHtml(w.manager)).join(', ')}`
                  : remaining === 0
                    ? '✓ All payments received'
                    : `${remaining} payment${remaining === 1 ? '' : 's'} remaining`
              }
            </small>

          </div>


          <div class="payment-gw-count">

            <strong>
              ${paidCount}/${managers.length}
            </strong>

            <small>
              PAID
            </small>

          </div>

        </summary>


        <div class="payment-gw-body">


          <!-- ZELLE FOR THIS GW -->

          <div class="zelle-card">

            <p class="zelle-label">
              SEND GW${gw} PAYMENT VIA ZELLE
            </p>


            <div class="zelle-line">

              <strong>
                ${
                  zelle
                    ? escapeHtml(zelle)
                    : 'Zelle not entered yet'
                }
              </strong>


              ${
                zelle
                  ? `
                    <button
                      type="button"
                      class="copy-button"
                      data-copy-zelle="${gw}"
                    >
                      COPY
                    </button>
                  `
                  : ''
              }

            </div>


            <p class="zelle-help">

              $20 entry
              ${
                winners.length > 1
                  ? ` per winner (${winners.length}-way tie)`
                  : ''
              }

              ${
                winners.length
                  ? ` • Payment goes to ${winners.map(w => escapeHtml(w.manager)).join(', ')}`
                  : ' • Winner not selected yet'
              }

            </p>

          </div>


          ${managerRows}


          <div class="payment-share-actions">

            <button
              type="button"
              class="gw-copy-button"
              data-copy-gw="${gw}"
            >
              📋 Copy Text
            </button>


            <button
              type="button"
              class="gw-share-button"
              data-share-gw="${gw}"
            >
              ↗ Share Reminder
            </button>

          </div>

        </div>

      </details>
    `);

  }


  if ($('paymentHistory')) {

    $('paymentHistory')
      .innerHTML =
        cards.join('');

  }


  bindPaymentButtons();

}


/* =====================================================
   PAYMENT CARD URL EVENTS
===================================================== */

function bindPaymentCardUrlEvents() {

  document
    .querySelectorAll(
      '.payment-gw-card'
    )
    .forEach(
      card => {

        card.addEventListener(
          'toggle',
          () => {

            if (!card.open) {
              return;
            }


            const gw =
              Number(
                card.dataset
                  .paymentGw
              );


            /*
              Keep one payment GW open.
            */

            document
              .querySelectorAll(
                '.payment-gw-card'
              )
              .forEach(
                other => {

                  if (
                    other !==
                    card
                  ) {

                    other.open =
                      false;

                  }

                }
              );


            /*
              Update shareable URL.
            */

            updateUrl(
              'payments',
              gw,
              false
            );

          }
        );

      }
    );

}


/* =====================================================
   OPEN SPECIFIC PAYMENT GW
===================================================== */

function openRequestedPaymentGw(
  gw,
  scroll = true
) {

  if (!gw) {
    return;
  }


  const card =
    document.querySelector(
      `[data-payment-gw="${gw}"]`
    );


  if (!card) {
    return;
  }


  document
    .querySelectorAll(
      '.payment-gw-card'
    )
    .forEach(
      other => {

        other.open =
          other === card;

      }
    );


  card.open =
    true;


  if (scroll) {

    setTimeout(
      () => {

        card.scrollIntoView({
          behavior:
            'smooth',

          block:
            'start'
        });

      },
      100
    );

  }

}


/* =====================================================
   PAYMENT BUTTONS
===================================================== */

function bindPaymentButtons() {

  /*
    COPY ZELLE
  */

  document
    .querySelectorAll(
      '[data-copy-zelle]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async event => {

            event.preventDefault();
            event.stopPropagation();


            const gw =
              Number(
                button.dataset
                  .copyZelle
              );


            const zelle =
              zelleForGw(
                gw
              );


            if (!zelle) {
              return;
            }


            try {

              await navigator
                .clipboard
                .writeText(
                  zelle
                );


              const oldText =
                button.textContent;


              button.textContent =
                'COPIED ✓';


              setTimeout(
                () => {

                  button.textContent =
                    oldText;

                },
                1400
              );


            } catch {

              window.prompt(
                `GW${gw} Zelle:`,
                zelle
              );

            }

          }
        );

      }
    );


  /*
    COPY PAYMENT REMINDER
  */

  document
    .querySelectorAll(
      '[data-copy-gw]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async event => {

            event.preventDefault();
            event.stopPropagation();


            const gw =
              Number(
                button.dataset
                  .copyGw
              );


            const success =
              await copyReminder(
                gw
              );


            if (success) {

              const oldText =
                button.textContent;


              button.textContent =
                '✓ Copied';


              setTimeout(
                () => {

                  button.textContent =
                    oldText;

                },
                1400
              );

            }

          }
        );

      }
    );


  /*
    SHARE PAYMENT REMINDER
  */

  document
    .querySelectorAll(
      '[data-share-gw]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          event => {

            event.preventDefault();
            event.stopPropagation();


            openShareModal(
              Number(
                button.dataset
                  .shareGw
              )
            );

          }
        );

      }
    );


  bindPaymentCardUrlEvents();

}


/* =====================================================
   PAYMENT REMINDER TEXT
===================================================== */

function buildReminderText(gw) {

  const unpaid =
    unpaidManagersForGw(
      gw
    );


  const zelle =
    zelleForGw(
      gw
    ) ||
    'Not entered yet';


  const paymentLink =
    `${window.location.origin}/?tab=payments&gw=${gw}`;


  if (
    unpaid.length === 0
  ) {

    return (
      `🏆 BALL KNOWLEDGE ONLY\n` +
      `GW${gw} PAYMENT UPDATE\n\n` +
      `✅ Everyone has paid for GW${gw}.\n\n` +
      `${paymentLink}`
    );

  }


  const names =
    unpaid
      .map(
        manager =>
          `• ${manager.manager} (${manager.team})`
      )
      .join('\n');


  return (
    `💰 BALL KNOWLEDGE ONLY\n` +
    `GW${gw} PAYMENT REMINDER\n\n` +
    `$20 per player\n` +
    `Zelle: ${zelle}\n\n` +
    `Still unpaid:\n` +
    `${names}\n\n` +
    `${unpaid.length} payment${unpaid.length === 1 ? '' : 's'} remaining.\n\n` +
    `View payments:\n` +
    `${paymentLink}`
  );

}


/* =====================================================
   COPY REMINDER
===================================================== */

async function copyReminder(gw) {

  const text =
    buildReminderText(
      gw
    );


  try {

    await navigator
      .clipboard
      .writeText(
        text
      );


    return true;


  } catch {

    window.prompt(
      'Copy payment reminder:',
      text
    );


    return false;

  }

}


/* =====================================================
   SHARE MODAL
===================================================== */

function openShareModal(gw) {

  activeShareGw =
    gw;


  const unpaid =
    unpaidManagersForGw(
      gw
    );


  const zelle =
    zelleForGw(
      gw
    );


  if ($('shareModalTitle')) {

    $('shareModalTitle')
      .textContent =
        `GW ${gw}`;

  }


  const body =
    $('sharePreviewBody');


  if (!body) {
    return;
  }


  if (
    unpaid.length === 0
  ) {

    body.innerHTML = `
      <div class="share-all-paid">

        <div class="share-big-check">
          ✓
        </div>

        <strong>
          ALL PAID
        </strong>

        <p>
          Everyone has paid for GW ${gw}.
        </p>

      </div>
    `;

  } else {

    const rows =
      unpaid
        .map(
          manager => `
            <div class="share-unpaid-row">

              <div class="share-warning">
                !
              </div>

              <div>

                <strong>
                  ${escapeHtml(manager.manager)}
                </strong>

                <small>
                  ${escapeHtml(manager.team)}
                </small>

              </div>

            </div>
          `
        )
        .join('');


    body.innerHTML = `

      <div class="share-payment-info">

        <div>
          <span>ENTRY</span>
          <strong>$20</strong>
        </div>

        <div>
          <span>REMAINING</span>
          <strong>${unpaid.length}</strong>
        </div>

      </div>


      <div class="share-zelle">

        <span>
          GW${gw} ZELLE
        </span>

        <strong>
          ${
            zelle
              ? escapeHtml(zelle)
              : 'Not entered yet'
          }
        </strong>

      </div>


      <div class="share-unpaid-title">
        STILL UNPAID
      </div>


      <div class="share-unpaid-list">
        ${rows}
      </div>


      <div class="share-card-footer">
        BALL KNOWLEDGE ONLY • NO LUCK. ONLY STATS.
      </div>
    `;

  }


  const title =
    document.querySelector(
      '.share-card-gw'
    );


  if (title) {

    title.textContent =
      `GW ${gw} PAYMENT REMINDER`;

  }


  if ($('shareModal')) {

    $('shareModal')
      .hidden =
        false;

  }


  document.body
    .classList.add(
      'modal-open'
    );

}


function closeShareModal() {

  if ($('shareModal')) {

    $('shareModal')
      .hidden =
        true;

  }


  activeShareGw =
    null;


  document.body
    .classList.remove(
      'modal-open'
    );

}


/* =====================================================
   CANVAS HELPERS
===================================================== */

function wrapCanvasText(
  ctx,
  text,
  maxWidth
) {

  const words =
    String(text)
      .split(' ');


  const lines =
    [];


  let line =
    '';


  for (
    const word of words
  ) {

    const testLine =
      line
        ? `${line} ${word}`
        : word;


    const width =
      ctx
        .measureText(
          testLine
        )
        .width;


    if (
      width >
        maxWidth &&
      line
    ) {

      lines.push(
        line
      );


      line =
        word;

    } else {

      line =
        testLine;

    }

  }


  if (line) {

    lines.push(
      line
    );

  }


  return lines;

}


/* =====================================================
   CREATE REMINDER PNG
===================================================== */

function createReminderCanvas(gw) {

  const unpaid =
    unpaidManagersForGw(
      gw
    );


  const zelle =
    zelleForGw(
      gw
    );


  const scale =
    2;


  const width =
    1080;


  const rowHeight =
    135;


  const baseHeight =
    unpaid.length === 0
      ? 900
      : 710 +
        unpaid.length *
          rowHeight;


  const height =
    Math.max(
      1080,
      baseHeight
    );


  const canvas =
    document.createElement(
      'canvas'
    );


  canvas.width =
    width * scale;


  canvas.height =
    height * scale;


  const ctx =
    canvas.getContext(
      '2d'
    );


  ctx.scale(
    scale,
    scale
  );


  /*
    BACKGROUND
  */

  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      width,
      height
    );


  gradient.addColorStop(
    0,
    '#171207'
  );


  gradient.addColorStop(
    0.32,
    '#090b0e'
  );


  gradient.addColorStop(
    1,
    '#050607'
  );


  ctx.fillStyle =
    gradient;


  ctx.fillRect(
    0,
    0,
    width,
    height
  );


  /*
    BRAND
  */

  ctx.fillStyle =
    '#D6AD55';


  ctx.fillRect(
    70,
    70,
    150,
    10
  );


  ctx.font =
    '700 30px Arial';


  ctx.fillText(
    'BALL KNOWLEDGE ONLY',
    70,
    135
  );


  /*
    TITLE
  */

  ctx.fillStyle =
    '#FFFFFF';


  ctx.font =
    '700 62px Arial';


  ctx.fillText(
    `GW ${gw}`,
    70,
    225
  );


  ctx.font =
    '700 42px Arial';


  ctx.fillText(
    'PAYMENT REMINDER',
    70,
    285
  );


  /*
    STATS
  */

  ctx.fillStyle =
    '#9AA0AA';


  ctx.font =
    '700 22px Arial';


  ctx.fillText(
    'ENTRY',
    70,
    370
  );


  ctx.fillText(
    'REMAINING',
    350,
    370
  );


  ctx.fillStyle =
    '#FFFFFF';


  ctx.font =
    '700 48px Arial';


  ctx.fillText(
    '$20',
    70,
    425
  );


  ctx.fillText(
    String(
      unpaid.length
    ),
    350,
    425
  );


  /*
    ZELLE
  */

  ctx.fillStyle =
    '#D6AD55';


  ctx.font =
    '700 22px Arial';


  ctx.fillText(
    `GW${gw} ZELLE`,
    70,
    505
  );


  ctx.fillStyle =
    '#FFFFFF';


  ctx.font =
    '700 33px Arial';


  const zelleLines =
    wrapCanvasText(
      ctx,
      zelle ||
      'Not entered yet',
      900
    );


  zelleLines.forEach(
    (line, index) => {

      ctx.fillText(
        line,
        70,
        550 +
        index * 40
      );

    }
  );


  let y =
    655;


  /*
    ALL PAID
  */

  if (
    unpaid.length === 0
  ) {

    ctx.fillStyle =
      '#52CA87';


    ctx.font =
      '700 70px Arial';


    ctx.fillText(
      '✓ ALL PAID',
      70,
      y + 100
    );


    ctx.fillStyle =
      '#A2A8B0';


    ctx.font =
      '28px Arial';


    ctx.fillText(
      `Everyone has paid for GW ${gw}.`,
      70,
      y + 165
    );


  } else {

    /*
      UNPAID
    */

    ctx.fillStyle =
      '#D6AD55';


    ctx.font =
      '700 25px Arial';


    ctx.fillText(
      'STILL UNPAID',
      70,
      y
    );


    y +=
      55;


    unpaid.forEach(
      manager => {

        ctx.strokeStyle =
          '#272B31';


        ctx.lineWidth =
          2;


        ctx.beginPath();


        ctx.moveTo(
          70,
          y
        );


        ctx.lineTo(
          1010,
          y
        );


        ctx.stroke();


        /*
          ALERT CIRCLE
        */

        ctx.fillStyle =
          '#2A1517';


        ctx.beginPath();


        ctx.arc(
          100,
          y + 60,
          26,
          0,
          Math.PI * 2
        );


        ctx.fill();


        ctx.fillStyle =
          '#ED7777';


        ctx.font =
          '700 28px Arial';


        ctx.textAlign =
          'center';


        ctx.fillText(
          '!',
          100,
          y + 70
        );


        ctx.textAlign =
          'left';


        /*
          MANAGER
        */

        ctx.fillStyle =
          '#FFFFFF';


        ctx.font =
          '700 31px Arial';


        ctx.fillText(
          manager.manager,
          155,
          y + 53
        );


        /*
          TEAM
        */

        ctx.fillStyle =
          '#969DA6';


        ctx.font =
          '25px Arial';


        ctx.fillText(
          manager.team,
          155,
          y + 90
        );


        y +=
          rowHeight;

      }
    );

  }


  /*
    FOOTER
  */

  ctx.fillStyle =
    '#D6AD55';


  ctx.font =
    '700 20px Arial';


  ctx.fillText(
    'NO LUCK. ONLY STATS.',
    70,
    height - 70
  );


  return canvas;

}


/* =====================================================
   SHARE PNG
===================================================== */

async function shareReminderImage(gw) {

  const button =
    $('shareReminderImage');


  if (button) {

    button.disabled =
      true;


    button.textContent =
      'Creating…';

  }


  try {

    const canvas =
      createReminderCanvas(
        gw
      );


    const blob =
      await new Promise(
        resolve =>
          canvas.toBlob(
            resolve,
            'image/png',
            1
          )
      );


    if (!blob) {

      throw new Error(
        'Unable to create image'
      );

    }


    const file =
      new File(
        [blob],
        `ball-knowledge-gw${gw}-payment-reminder.png`,
        {
          type:
            'image/png'
        }
      );


    /*
      Native mobile share sheet
    */

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({
        files: [
          file
        ]
      })
    ) {

      await navigator.share({

        title:
          `GW${gw} Payment Reminder`,

        text:
          `Ball Knowledge Only — GW${gw} payment reminder`,

        files:
          [
            file
          ]

      });


      return;

    }


    /*
      Browser fallback
    */

    const url =
      URL.createObjectURL(
        blob
      );


    const link =
      document.createElement(
        'a'
      );


    link.href =
      url;


    link.download =
      `GW${gw}-payment-reminder.png`;


    document.body
      .appendChild(
        link
      );


    link.click();


    link.remove();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      1000
    );


  } catch (error) {

    if (
      error.name !==
      'AbortError'
    ) {

      alert(
        error.message ||
        'Unable to share image'
      );

    }


  } finally {

    if (button) {

      button.disabled =
        false;


      button.textContent =
        'Share Image';

    }

  }

}


/* =====================================================
   REFRESH PAYMENTS ONLY
===================================================== */

async function refreshPaymentsOnly() {

  if (!dashboardData) {
    return;
  }


  const currentGw =
    getCurrentGw();


  try {

    const response =
      await fetch(
        `/api/payments?from=1&to=${currentGw}&_=${Date.now()}`,
        {
          cache:
            'no-store',

          headers: {
            'Cache-Control':
              'no-cache'
          }
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        'Unable to refresh payments'
      );

    }


    allPayments =
      Array.isArray(
        data.payments
      )
        ? data.payments
        : [];


    allGwSettings =
      Array.isArray(
        data.gameweekSettings
      )
        ? data.gameweekSettings
        : [];


    paymentMeta =
      data;


    renderPaymentHistory();


    /*
      GW win counts (Analytics tab) are derived
      from these same payment records.
    */

    renderAnalytics();


  } catch (error) {

    console.error(
      'Payment refresh failed:',
      error
    );

  }

}


/* =====================================================
   OPEN TAB
===================================================== */

async function openTab(
  tab,
  options = {}
) {

  if (
    !VALID_TABS.includes(
      tab
    )
  ) {

    tab =
      'gameweek';

  }


  const {
    gw = null,
    updateHistory = true,
    scroll = true
  } = options;


  /*
    NAV
  */

  document
    .querySelectorAll(
      '[data-tab]'
    )
    .forEach(
      button => {

        button.classList.toggle(
          'active',
          button.dataset.tab ===
            tab
        );

      }
    );


  /*
    PANELS
  */

  document
    .querySelectorAll(
      '.panel'
    )
    .forEach(
      panel => {

        panel.hidden =
          panel.id !==
          tab;

      }
    );


  /*
    GAMEWEEK TAB
  */

  if (
    tab === 'gameweek'
  ) {

    const desiredGw =
      gw ||
      getCurrentGw();


    await loadGameweekView(
      desiredGw,
      {
        updateHistory:
          false
      }
    );

  }


  /*
    PAYMENTS
  */

  if (
    tab === 'payments'
  ) {

    await refreshPaymentsOnly();


    if (gw) {

      openRequestedPaymentGw(
        gw,
        scroll
      );

    }

  }


  /*
    PREDICTIONS
  */

  if (
    tab === 'predictions'
  ) {

    renderPredictions();


    if (
      !squadsData &&
      !squadsLoading
    ) {

      await loadSquadsData();

    }

  }


  /*
    ANALYTICS
  */

  if (
    tab === 'analytics'
  ) {

    renderAnalytics();

  }


  /*
    SQUADS
  */

  if (
    tab === 'squads'
  ) {

    renderSquadsTab();


    if (
      !squadsData &&
      !squadsLoading
    ) {

      await loadSquadsData();

    }

  }


  /*
    FIXTURES
  */

  if (
    tab === 'fixtures'
  ) {

    renderFixtures();

  }


  /*
    URL
  */

  if (updateHistory) {

    const urlGw =
      (
        tab === 'gameweek' ||
        tab === 'payments'
      )
        ? (
            gw ||
            (
              tab === 'gameweek'
                ? selectedGw
                : null
            )
          )
        : null;


    updateUrl(
      tab,
      urlGw,
      true
    );

  }


  if (
    scroll &&
    !(
      tab === 'payments' &&
      gw
    )
  ) {

    window.scrollTo({
      top:
        0,

      behavior:
        'smooth'
    });

  }

}


/* =====================================================
   LOAD CURRENT APP DATA
===================================================== */

async function loadEverything() {

  if ($('updated')) {

    $('updated')
      .textContent =
        'Updating…';

  }


  try {

    /*
      CURRENT FPL DASHBOARD
    */

    const response =
      await fetch(
        `/api/dashboard?leagueId=${LEAGUE_ID}&_=${Date.now()}`,
        {
          cache:
            'no-store'
        }
      );


    const dashboard =
      await response.json();


    if (!response.ok) {

      throw new Error(
        dashboard.error ||
        'Unable to load FPL'
      );

    }


    dashboardData =
      dashboard;


    /*
      Default GW = current.
    */

    selectedGw =
      getCurrentGw();


    gwViewData =
      dashboardData;


    renderCurrentLeagueData();


    buildPublicGwSelect();


    /*
      Predictions/squads (current GW only).
      Not awaited - the picks fetch is slower and
      shouldn't block the rest of the page painting.
    */

    loadSquadsData();


    /*
      Payment history.
    */

    await refreshPaymentsOnly();


    if ($('updated')) {

      $('updated')
        .textContent =
          `Updated ${new Date().toLocaleTimeString([], {
            hour:
              'numeric',

            minute:
              '2-digit'
          })}`;

    }


  } catch (error) {

    console.error(
      error
    );


    if ($('updated')) {

      $('updated')
        .textContent =
          error.message;

    }


    if ($('connectionStatus')) {

      $('connectionStatus')
        .textContent =
          '● CONNECTION ERROR';


      $('connectionStatus')
        .className =
          'connection error';

    }

  }

}


/* =====================================================
   PUBLIC GW SELECT EVENT
===================================================== */

if ($('publicGwSelect')) {

  $('publicGwSelect')
    .addEventListener(
      'change',
      async event => {

        const gw =
          Number(
            event.target.value
          );


        await loadGameweekView(
          gw,
          {
            updateHistory:
              true
          }
        );


        window.scrollTo({
          top:
            0,

          behavior:
            'smooth'
        });

      }
    );

}


/* =====================================================
   FIXTURES TAB - GW SELECTOR + TAP A MATCH FOR DETAIL
===================================================== */

if ($('fixturesGwSelect')) {

  $('fixturesGwSelect')
    .addEventListener(
      'change',
      event => {

        const gw =
          Number(event.target.value);

        if (!Number.isInteger(gw) || gw < 1 || gw > SEASON_GW_COUNT) {
          return;
        }

        fixturesGw = gw;
        fixturesData = null;

        renderFixtures();

      }
    );

}


if ($('fixturesBody')) {

  $('fixturesBody')
    .addEventListener(
      'click',
      event => {

        const row =
          event.target.closest('[data-fixture-id]');

        if (!row) {
          return;
        }

        openFixtureDetail(
          Number(row.dataset.fixtureId)
        );

      }
    );

}


document
  .querySelectorAll(
    '[data-close-fixture-sheet]'
  )
  .forEach(
    element => {

      element.addEventListener(
        'click',
        closeFixtureDetail
      );

    }
  );


/* =====================================================
   MAIN NAVIGATION
===================================================== */

document
  .querySelectorAll(
    '[data-tab]'
  )
  .forEach(
    button => {

      button.addEventListener(
        'click',
        async () => {

          const tab =
            button.dataset
              .tab;


          /*
            When clicking GW manually,
            show the currently selected GW.

            When clicking Payments manually,
            default to current payment GW.
          */

          await openTab(
            tab,
            {
              gw:
                tab === 'gameweek'
                  ? selectedGw
                  : null,

              updateHistory:
                true,

              scroll:
                true
            }
          );

        }
      );

    }
  );


/* =====================================================
   SQUAD MANAGER PICKER
===================================================== */

if ($('squadManagerPicker')) {

  $('squadManagerPicker')
    .addEventListener(
      'click',
      event => {

        const button =
          event.target.closest(
            '[data-entry]'
          );


        if (!button) {
          return;
        }


        selectedSquadEntry =
          Number(
            button.dataset.entry
          );


        renderSquadsTab();

      }
    );

}


/* =====================================================
   SQUAD COMPARE TOGGLE + OPPONENT PICKER
===================================================== */

if ($('compareToggle')) {

  $('compareToggle')
    .addEventListener(
      'click',
      () => {

        compareMode =
          !compareMode;

        renderSquadsTab();

      }
    );

}


if ($('comparePicker')) {

  $('comparePicker')
    .addEventListener(
      'click',
      event => {

        const button =
          event.target.closest(
            '[data-compare-entry]'
          );


        if (!button) {
          return;
        }


        compareEntry =
          Number(
            button.dataset.compareEntry
          );


        renderSquadsTab();

      }
    );

}


/* =====================================================
   GW STANDINGS -> TAP A MANAGER TO VIEW THEIR SQUAD
===================================================== */

if ($('weeklyList')) {

  $('weeklyList')
    .addEventListener(
      'click',
      async event => {

        const row =
          event.target.closest(
            '[data-entry]'
          );


        if (!row) {
          return;
        }


        selectedSquadEntry =
          Number(
            row.dataset.entry
          );


        await openTab(
          'squads',
          {
            updateHistory: true,
            scroll: true
          }
        );

      }
    );

}


/* =====================================================
   PLAYER OWNERSHIP SHEET (Squads tab)
===================================================== */

if ($('squadDetail')) {

  $('squadDetail')
    .addEventListener(
      'click',
      event => {

        const resetAll =
          event.target.closest(
            '[data-reset-all-scenarios]'
          );

        if (resetAll) {
          compareScenarios = {};
          renderSquadComparison();
          return;
        }


        const scenarioRow =
          event.target.closest(
            '[data-scenario-entry]'
          );

        if (scenarioRow) {
          openScenarioSheet(
            Number(scenarioRow.dataset.scenarioEntry),
            Number(scenarioRow.dataset.scenarioPlayer)
          );
          return;
        }


        const card =
          event.target.closest(
            '[data-player-id]'
          );


        if (!card) {
          return;
        }


        openPlayerInfo(
          card.dataset.playerId
        );

      }
    );

}


document
  .querySelectorAll(
    '[data-close-player-info]'
  )
  .forEach(
    element => {

      element.addEventListener(
        'click',
        closePlayerInfo
      );

    }
  );


/* =====================================================
   "WHAT IF" SCENARIO SHEET CONTROLS
===================================================== */

if ($('scenarioSheet')) {

  $('scenarioSheet')
    .addEventListener(
      'click',
      event => {

        if (event.target.closest('[data-close-scenario-sheet]')) {
          closeScenarioSheet();
          return;
        }


        if (event.target.closest('[data-scenario-reset]')) {
          resetActiveScenario();
          return;
        }


        const segment =
          event.target.closest(
            '.scenario-segment[data-scenario-field]'
          );

        if (segment) {
          setScenarioField(
            segment.dataset.scenarioField,
            segment.dataset.value
          );
          return;
        }


        const step =
          event.target.closest(
            '.scenario-step[data-step]'
          );

        if (step) {
          const group =
            step.closest('[data-scenario-field]');

          if (group) {
            stepScenarioField(
              group.dataset.scenarioField,
              Number(step.dataset.step)
            );
          }
          return;
        }


        const toggle =
          event.target.closest(
            '.scenario-toggle[data-scenario-field]'
          );

        if (toggle) {
          toggleScenarioField(
            toggle.dataset.scenarioField
          );
          return;
        }

      }
    );

}


/* =====================================================
   BROWSER BACK / FORWARD
===================================================== */

window.addEventListener(
  'popstate',
  async () => {

    const tab =
      getRequestedTab();


    const gw =
      getRequestedGw();


    await openTab(
      tab,
      {
        gw,

        updateHistory:
          false,

        scroll:
          true
      }
    );

  }
);


/* =====================================================
   SHARE MODAL BUTTONS
===================================================== */

if ($('closeShare')) {

  $('closeShare')
    .addEventListener(
      'click',
      closeShareModal
    );

}


document
  .querySelectorAll(
    '[data-close-share]'
  )
  .forEach(
    element => {

      element.addEventListener(
        'click',
        closeShareModal
      );

    }
  );


if ($('copyReminder')) {

  $('copyReminder')
    .addEventListener(
      'click',
      async () => {

        if (!activeShareGw) {
          return;
        }


        const success =
          await copyReminder(
            activeShareGw
          );


        if (success) {

          const button =
            $('copyReminder');


          button.textContent =
            'Copied ✓';


          setTimeout(
            () => {

              button.textContent =
                'Copy Text';

            },
            1500
          );

        }

      }
    );

}


if ($('shareReminderImage')) {

  $('shareReminderImage')
    .addEventListener(
      'click',
      () => {

        if (!activeShareGw) {
          return;
        }


        shareReminderImage(
          activeShareGw
        );

      }
    );

}


/* =====================================================
   MAIN REFRESH
===================================================== */

if ($('refresh')) {

  $('refresh')
    .addEventListener(
      'click',
      async () => {

        /*
          Remember what the user is viewing.
        */

        const activeTab =
          getRequestedTab();


        const requestedGw =
          getRequestedGw();


        await loadEverything();


        await openTab(
          activeTab,
          {
            gw:
              requestedGw,

            updateHistory:
              false,

            scroll:
              false
          }
        );

      }
    );

}


/* =====================================================
   RETURN TO APP
===================================================== */

document.addEventListener(
  'visibilitychange',
  () => {

    if (
      document.visibilityState ===
        'visible' &&
      dashboardData
    ) {

      refreshPaymentsOnly();

    }

  }
);


window.addEventListener(
  'pageshow',
  () => {

    if (dashboardData) {

      refreshPaymentsOnly();

    }

  }
);


/* =====================================================
   LIGHT PAYMENT AUTO-REFRESH
===================================================== */

setInterval(
  () => {

    if (
      document.visibilityState ===
        'visible' &&
      dashboardData
    ) {

      refreshPaymentsOnly();

    }

  },
  30000
);


/* =====================================================
   LIVE SQUADS/PREDICTIONS AUTO-REFRESH

   While the current Gameweek has matches in progress,
   FPL's own live points keep changing - so the award
   card, Predict tab and Squads tab need to keep pulling
   fresh data too. Once every fixture in the Gameweek is
   finished, every squad's liveStatus flips to 'final'
   and this stops polling on its own.
===================================================== */

function anySquadStillLive() {

  return !!(
    squadsData &&
    Array.isArray(
      squadsData.squads
    ) &&
    squadsData.squads.some(
      squad =>
        squad.liveStatus ===
        'live'
    )
  );

}


setInterval(
  () => {

    if (
      document.visibilityState ===
        'visible' &&
      dashboardData &&
      gameweekHasStarted() &&
      !squadsLoading &&
      (
        !squadsData ||
        anySquadStillLive()
      )
    ) {

      loadSquadsData();

    }


    if (
      document.visibilityState ===
        'visible' &&
      dashboardData &&
      !fixturesLoading &&
      (
        !fixturesData ||
        anyFixtureStillLive()
      )
    ) {

      loadFixturesData();

    }

  },
  60000
);


/* =====================================================
   START
===================================================== */

async function startApp() {

  /*
    First load the CURRENT FPL league.
  */

  await loadEverything();


  /*
    Then honor the URL.
  */

  const requestedTab =
    getRequestedTab();


  let requestedGw =
    getRequestedGw();


  const currentGw =
    getCurrentGw();


  /*
    Prevent invalid future GW links.
  */

  if (
    requestedGw &&
    requestedGw >
      currentGw
  ) {

    requestedGw =
      currentGw;

  }


  /*
    For GW screen with no explicit GW,
    use current.
  */

  if (
    requestedTab ===
      'gameweek' &&
    !requestedGw
  ) {

    requestedGw =
      currentGw;

  }


  await openTab(
    requestedTab,
    {
      gw:
        requestedGw,

      updateHistory:
        false,

      scroll:
        false
    }
  );


  /*
    Normalize the initial URL so it
    becomes easy to copy/share.
  */

  if (
    requestedTab ===
    'gameweek'
  ) {

    updateUrl(
      'gameweek',
      requestedGw ||
      currentGw,
      false
    );

  }

}


startApp();
