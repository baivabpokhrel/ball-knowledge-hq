const $ = (id) =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

let dashboardData = null;
let paymentData = null;


/*
  ======================================
  HELPERS
  ======================================
*/

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function standingsRow(
  manager,
  index,
  weekly
) {
  const movement =
    manager.movement > 0
      ? `<span class="up">▲ ${manager.movement}</span>`
      : manager.movement < 0
        ? `<span class="down">▼ ${Math.abs(manager.movement)}</span>`
        : '—';

  return `
    <div class="standing-row">

      <div class="position">
        ${index + 1}
      </div>

      <div class="manager-info">

        <strong>
          ${escapeHtml(manager.team)}
        </strong>

        <small>
          ${escapeHtml(manager.manager)}
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


/*
  ======================================
  PAYMENT HELPERS
  ======================================
*/

function getPayment(
  entryId
) {
  if (
    !paymentData ||
    !Array.isArray(
      paymentData.payments
    )
  ) {
    return null;
  }

  return (
    paymentData.payments.find(
      (item) =>
        Number(
          item.entry_id
        ) ===
        Number(entryId)
    ) || null
  );
}


function isPaid(entryId) {
  return (
    getPayment(entryId)
      ?.paid === true
  );
}


function isManualWinner(
  entryId
) {
  return (
    getPayment(entryId)
      ?.winner === true
  );
}


/*
  ======================================
  RENDER DASHBOARD
  ======================================
*/

function renderDashboard(data) {
  dashboardData = data;

  $('league').textContent =
    data.league?.name ||
    'Ball Knowledge Only';

  const managers =
    Array.isArray(
      data.managers
    )
      ? data.managers
      : [];

  $('connectionStatus')
    .textContent =
      `● FPL CONNECTED • ${managers.length} MANAGERS`;

  $('connectionStatus')
    .classList.add(
      'connected'
    );

  $('gw').textContent =
    data.gameweek?.id ??
    '—';

  $('paymentGw').textContent =
    data.gameweek?.id ??
    '—';

  $('statusCode')
    .textContent =
      data.gameweek
        ?.status
        ?.code ||
      '—';

  $('statusText')
    .textContent =
      data.gameweek
        ?.status
        ?.label ||
      '';

  const weekly =
    Array.isArray(
      data.weekly
    )
      ? data.weekly
      : [];

  const overall =
    Array.isArray(
      data.overall
    )
      ? data.overall
      : [];

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
            Gameweek standings will appear once scoring begins.
          </div>
        `;

  $('overallList')
    .innerHTML =
      overall.length
        ? overall
            .map(
              (manager, index) =>
                standingsRow(
                  manager,
                  index,
                  false
                )
            )
            .join('')
        : `
          <div class="empty">
            Overall standings are not available yet.
          </div>
        `;

  renderAwards();

  renderPayments();
}


/*
  ======================================
  GAMEWEEK AWARDS
  ======================================
*/

function renderAwards() {
  if (!dashboardData) {
    return;
  }

  const status =
    dashboardData
      .gameweek
      ?.status;

  const awards =
    dashboardData.awards ||
    {};

  /*
    BEFORE DEADLINE
  */

  if (
    status?.code ===
    'PRE-SEASON'
  ) {
    $('awardTitle')
      .textContent =
        'Waiting for Gameweek';

    $('awardText')
      .textContent =
        'No leader yet';

    $('awardNote')
      .textContent =
        'Standings begin after the Gameweek deadline.';

    return;
  }

  /*
    FINAL
  */

  if (status?.final) {
    const winners =
      Array.isArray(
        awards.winners
      )
        ? awards.winners
        : [];

    $('awardTitle')
      .textContent =
        winners.length > 1
          ? 'Gameweek Winners'
          : 'Manager of the Week';

    $('awardText')
      .textContent =
        winners.length
          ? winners
              .map(
                winner =>
                  `${winner.team} — ${winner.gameweekPoints} pts`
              )
              .join(', ')
          : '—';

    $('awardNote')
      .textContent =
        'Official after FPL bonuses and corrections.';

    return;
  }

  /*
    LIVE
  */

  const provisional =
    Array.isArray(
      awards.provisionalLeader
    )
      ? awards.provisionalLeader
      : [];

  $('awardTitle')
    .textContent =
      'Provisional Leader';

  $('awardText')
    .textContent =
      provisional.length
        ? provisional
            .map(
              leader =>
                `${leader.team} — ${leader.gameweekPoints} pts`
            )
            .join(', ')
        : '—';

  $('awardNote')
    .textContent =
      'Not official. Points can still change.';
}


/*
  ======================================
  FIND GW WINNER
  ======================================
*/

function getDisplayedWinner() {
  if (!dashboardData) {
    return null;
  }

  const managers =
    dashboardData.managers ||
    [];

  /*
    1. Manual/admin winner
  */

  const manual =
    managers.find(
      manager =>
        isManualWinner(
          manager.entryId
        )
    );

  if (manual) {
    return {
      ...manual,
      source:
        'manual'
    };
  }

  /*
    2. Official FPL winner,
       only after FINAL
  */

  if (
    dashboardData
      .gameweek
      ?.status
      ?.final
  ) {
    const winners =
      dashboardData
        .awards
        ?.winners ||
      [];

    if (
      winners.length > 0
    ) {
      return {
        ...winners[0],
        source:
          'official'
      };
    }
  }

  return null;
}


/*
  ======================================
  PAYMENTS
  ======================================
*/

function renderPayments() {
  if (
    !dashboardData ||
    !paymentData
  ) {
    return;
  }

  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];

  $('fee').textContent =
    paymentData.fee ?? '—';

  $('zelleValue')
    .textContent =
      paymentData.zelle ||
      'Not configured';


  /*
    WINNER
  */

  const winner =
    getDisplayedWinner();

  if (winner) {
    $('winnerLabel')
      .textContent =
        winner.source ===
        'official'
          ? 'OFFICIAL GW WINNER'
          : 'GW WINNER';

    $('winnerTeam')
      .textContent =
        winner.team;

    $('winnerManager')
      .textContent =
        winner.manager;

  } else {
    $('winnerLabel')
      .textContent =
        'GW WINNER';

    $('winnerTeam')
      .textContent =
        'To be decided';

    $('winnerManager')
      .textContent =
        dashboardData
          .gameweek
          ?.status
          ?.final
          ? 'No winner selected.'
          : 'Winner will appear after the Gameweek.';
  }


  /*
    PAYMENT TOTAL
  */

  const paidManagers =
    managers.filter(
      manager =>
        isPaid(
          manager.entryId
        )
    );

  const paidCount =
    paidManagers.length;

  const total =
    managers.length;

  const remaining =
    Math.max(
      0,
      total - paidCount
    );

  $('paidCount')
    .textContent =
      `${paidCount} / ${total}`;

  $('remainingCount')
    .textContent =
      remaining === 0 &&
      total > 0
        ? '✓ ALL PAID'
        : `${remaining} REMAINING`;

  const percent =
    total > 0
      ? Math.round(
          (
            paidCount /
            total
          ) * 100
        )
      : 0;

  $('paymentProgress')
    .style.width =
      `${percent}%`;


  /*
    UNPAID FIRST
  */

  const sorted =
    [...managers].sort(
      (a, b) => {

        const aPaid =
          isPaid(
            a.entryId
          );

        const bPaid =
          isPaid(
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
          a.team
        ).localeCompare(
          String(
            b.team
          )
        );
      }
    );


  $('paymentList')
    .innerHTML =
      sorted.length
        ? sorted
            .map(
              manager => {

                const paid =
                  isPaid(
                    manager.entryId
                  );

                const winner =
                  getDisplayedWinner();

                const isWinner =
                  winner &&
                  Number(
                    winner.entryId
                  ) ===
                  Number(
                    manager.entryId
                  );

                return `
                  <div class="
                    payment-row
                    ${
                      paid
                        ? 'is-paid'
                        : 'is-unpaid'
                    }
                    ${
                      isWinner
                        ? 'is-winner'
                        : ''
                    }
                  ">

                    <div class="payment-status">
                      ${
                        paid
                          ? '✓'
                          : '!'
                      }
                    </div>

                    <div class="manager-info">

                      <strong>
                        ${escapeHtml(manager.team)}
                      </strong>

                      <small>
                        ${escapeHtml(manager.manager)}
                      </small>

                      ${
                        isWinner
                          ? `
                            <span class="winner-mini">
                              🏆 GW WINNER
                            </span>
                          `
                          : ''
                      }

                    </div>

                    <div class="payment-label">
                      ${
                        paid
                          ? 'PAID'
                          : 'NOT PAID'
                      }
                    </div>

                  </div>
                `;
              }
            )
            .join('')
        : `
          <div class="empty">
            No FPL managers found.
          </div>
        `;
}


/*
  ======================================
  LOAD FPL
  ======================================
*/

async function loadDashboard() {
  const response =
    await fetch(
      `/api/dashboard?leagueId=${LEAGUE_ID}`,
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
      'Unable to load FPL league'
    );
  }

  renderDashboard(data);

  return data;
}


/*
  ======================================
  LOAD PAYMENTS
  ======================================
*/

async function loadPayments(
  gameweek
) {
  const response =
    await fetch(
      `/api/payments?gw=${gameweek}`,
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
      'Unable to load payments'
    );
  }

  paymentData =
    data;

  renderPayments();
}


/*
  ======================================
  LOAD EVERYTHING
  ======================================
*/

async function loadEverything() {
  $('updated')
    .textContent =
      'Updating…';

  try {
    const dashboard =
      await loadDashboard();

    const gameweek =
      dashboard
        .gameweek
        ?.id ||
      1;

    await loadPayments(
      gameweek
    );

    $('updated')
      .textContent =
        `Updated ${new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })}`;

  } catch (error) {
    console.error(
      error
    );

    $('updated')
      .textContent =
        error.message;

    $('connectionStatus')
      .textContent =
        '● CONNECTION ERROR';

    $('connectionStatus')
      .classList.remove(
        'connected'
      );

    $('connectionStatus')
      .classList.add(
        'error'
      );
  }
}


/*
  ======================================
  COPY ZELLE
  ======================================
*/

$('copyZelle')
  .addEventListener(
    'click',
    async () => {

      const value =
        $('zelleValue')
          .textContent
          .trim();

      if (
        !value ||
        value ===
        'Not configured'
      ) {
        return;
      }

      const button =
        $('copyZelle');

      try {
        await navigator
          .clipboard
          .writeText(
            value
          );

        button.textContent =
          'COPIED ✓';

        setTimeout(
          () => {
            button.textContent =
              'COPY';
          },
          1500
        );

      } catch {
        window.prompt(
          'Copy Zelle information:',
          value
        );
      }
    }
  );


/*
  ======================================
  NAVIGATION
  ======================================
*/

document
  .querySelectorAll(
    '[data-tab]'
  )
  .forEach(
    button => {

      button.addEventListener(
        'click',
        () => {

          const target =
            button
              .dataset
              .tab;

          document
            .querySelectorAll(
              '[data-tab]'
            )
            .forEach(
              item => {
                item.classList
                  .toggle(
                    'active',
                    item ===
                      button
                  );
              }
            );

          document
            .querySelectorAll(
              '.panel'
            )
            .forEach(
              panel => {
                panel.hidden =
                  panel.id !==
                  target;
              }
            );

          window.scrollTo({
            top: 0,
            behavior:
              'smooth'
          });
        }
      );
    }
  );


$('refresh')
  .addEventListener(
    'click',
    loadEverything
  );


loadEverything();
