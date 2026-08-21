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
  'analytics'
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


  const chip =
    weekly &&
    getCurrentGw() ===
      (gwViewData?.gameweek?.id || 0)
      ? squadFor(manager.entryId)
          ?.activeChipLabel
      : null;


  return `
    <div class="standing-row">

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


    const response =
      await fetch(
        `/api/analytics?entries=${entries}&throughGw=${getCurrentGw()}&_=${Date.now()}`,
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


    renderGameweekAward();

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

        <small>
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


  renderSelectedSquad();

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


  const liveStatus =
    squad.liveStatus || 'upcoming';


  const totalLabel =
    liveStatus === 'final'
      ? 'FINAL SCORE'
      : liveStatus === 'live'
        ? 'LIVE SCORE'
        : 'PROJECTED';


  const totalValue =
    liveStatus === 'final' &&
    squad.actualPoints != null
      ? squad.actualPoints
      : squad.predictedTotal;


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
      <div class="squad-summary-total tone-${liveStatus}">
        <strong>${totalValue}</strong>
        <small>${totalLabel}</small>
      </div>
    </div>


    <div class="section-heading">
      <h3>Starting XI</h3>
    </div>

    <div class="standings-list" style="margin-bottom:22px;">
      ${
        squad.startingXI
          .map(
            player =>
              squadPlayerRow(player)
          )
          .join('')
      }
    </div>


    <div class="section-heading">
      <h3>Bench</h3>
    </div>

    <div class="standings-list">
      ${
        squad.bench
          .map(
            player =>
              squadPlayerRow(player)
          )
          .join('')
      }
    </div>

  `;

}


function squadPlayerRow(player) {

  const badge =
    player.isCaptain
      ? ' (C)'
      : player.isViceCaptain
        ? ' (V)'
        : '';


  const isUpcoming =
    (player.status || 'upcoming') === 'upcoming';


  const pointsLabel =
    player.status === 'final'
      ? 'FINAL'
      : player.status === 'live'
        ? 'LIVE'
        : '';


  return `
    <div class="standing-row">

      <div class="position">
        ${escapeHtml(player.position)}
      </div>


      <div class="manager-info">

        <strong>
          ${statusDot(player.status)}${escapeHtml(player.name)}${badge}
        </strong>

        <small>
          ${escapeHtml(player.team)}
        </small>

      </div>


      <div class="points">
        ${
          isUpcoming
            ? `
              <small class="points-pending">
                Not played yet
              </small>
            `
            : `
              <strong>
                ${Math.round(player.livePoints || 0)}
              </strong>

              <small>
                ${pointsLabel}
              </small>
            `
        }
      </div>

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
