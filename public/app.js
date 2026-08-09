const $ = id =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

let dashboardData = null;

let allPayments = [];

let paymentMeta = null;


/*
  ====================================
  HELPERS
  ====================================
*/

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function paymentFor(
  gw,
  entryId
) {
  return (
    allPayments.find(
      item =>
        Number(item.gameweek) ===
          Number(gw) &&
        Number(item.entry_id) ===
          Number(entryId)
    ) || null
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


function manualWinnerForGw(
  gw
) {
  const row =
    allPayments.find(
      item =>
        Number(item.gameweek) ===
          Number(gw) &&
        item.winner === true
    );

  if (!row) {
    return null;
  }

  return (
    dashboardData.managers.find(
      manager =>
        Number(manager.entryId) ===
        Number(row.entry_id)
    ) || null
  );
}


/*
  ====================================
  STANDINGS
  ====================================
*/

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
  ====================================
  CURRENT GW
  ====================================
*/

function renderDashboard() {
  const data =
    dashboardData;

  $('league')
    .textContent =
      data.league?.name ||
      'Ball Knowledge Only';

  $('connectionStatus')
    .textContent =
      `● FPL CONNECTED • ${data.managers.length} MANAGERS`;

  $('connectionStatus')
    .className =
      'connection connected';

  $('gw')
    .textContent =
      data.gameweek?.id ||
      '—';

  $('statusCode')
    .textContent =
      data.gameweek?.status?.code ||
      '—';

  $('statusText')
    .textContent =
      data.gameweek?.status?.label ||
      '';


  $('weeklyList')
    .innerHTML =
      data.weekly.length
        ? data.weekly.map(
            (manager, index) =>
              standingsRow(
                manager,
                index,
                true
              )
          ).join('')
        : `
          <div class="empty">
            No Gameweek points yet.
          </div>
        `;


  $('overallList')
    .innerHTML =
      data.overall.length
        ? data.overall.map(
            (manager, index) =>
              standingsRow(
                manager,
                index,
                false
              )
          ).join('')
        : `
          <div class="empty">
            No overall standings yet.
          </div>
        `;


  renderAward();
}


/*
  ====================================
  CURRENT GW AWARD
  ====================================
*/

function renderAward() {
  const data =
    dashboardData;

  const status =
    data.gameweek?.status;

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
        'Standings begin after the deadline.';

    return;
  }


  if (status?.final) {
    const winners =
      data.awards?.winners || [];

    $('awardTitle')
      .textContent =
        'Official GW Winner';

    $('awardText')
      .textContent =
        winners.length
          ? winners.map(
              winner =>
                `${winner.team} — ${winner.gameweekPoints} pts`
            ).join(', ')
          : '—';

    $('awardNote')
      .textContent =
        'Official after FPL checks.';

    return;
  }


  const leaders =
    data.awards
      ?.provisionalLeader ||
    [];

  $('awardTitle')
    .textContent =
      'Provisional Leader';

  $('awardText')
    .textContent =
      leaders.length
        ? leaders.map(
            leader =>
              `${leader.team} — ${leader.gameweekPoints} pts`
          ).join(', ')
        : '—';

  $('awardNote')
    .textContent =
      'Points may still change.';
}


/*
  ====================================
  ALL PAYMENT GWs
  ====================================
*/

function renderPaymentHistory() {
  if (
    !dashboardData ||
    !paymentMeta
  ) {
    return;
  }

  $('fee')
    .textContent =
      paymentMeta.fee;

  $('zelleValue')
    .textContent =
      paymentMeta.zelle ||
      'Not configured';


  const currentGw =
    Number(
      dashboardData
        .gameweek
        ?.id ||
      1
    );


  const cards = [];


  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {
    const managers =
      dashboardData.managers;

    const paidCount =
      managers.filter(
        manager =>
          paidFor(
            gw,
            manager.entryId
          )
      ).length;

    const winner =
      manualWinnerForGw(gw);

    const managerRows =
      managers
        .slice()
        .sort(
          (a, b) => {

            const aWinner =
              winner &&
              Number(
                winner.entryId
              ) ===
              Number(
                a.entryId
              );

            const bWinner =
              winner &&
              Number(
                winner.entryId
              ) ===
              Number(
                b.entryId
              );

            if (
              aWinner !== bWinner
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
              aPaid !== bPaid
            ) {
              return aPaid
                ? 1
                : -1;
            }

            return String(a.team)
              .localeCompare(
                String(b.team)
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
              winner &&
              Number(
                winner.entryId
              ) ===
              Number(
                manager.entryId
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
                    ${escapeHtml(manager.team)}
                  </strong>

                  <small>
                    ${escapeHtml(manager.manager)}
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
        ${gw === currentGw ? 'open' : ''}
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
                winner
                  ? `🏆 ${escapeHtml(winner.team)}`
                  : 'Winner not selected'
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

          ${managerRows}

        </div>

      </details>
    `);
  }


  $('paymentHistory')
    .innerHTML =
      cards.join('');
}


/*
  ====================================
  LOAD
  ====================================
*/

async function loadEverything() {
  $('updated')
    .textContent =
      'Updating…';

  try {
    const dashboardResponse =
      await fetch(
        `/api/dashboard?leagueId=${LEAGUE_ID}`,
        {
          cache:
            'no-store'
        }
      );

    const dashboard =
      await dashboardResponse
        .json();

    if (!dashboardResponse.ok) {
      throw new Error(
        dashboard.error ||
        'Unable to load FPL'
      );
    }

    dashboardData =
      dashboard;


    const currentGw =
      Number(
        dashboard
          .gameweek
          ?.id ||
        1
      );


    const paymentResponse =
      await fetch(
        `/api/payments?from=1&to=${currentGw}`,
        {
          cache:
            'no-store'
        }
      );

    const paymentJson =
      await paymentResponse
        .json();

    if (!paymentResponse.ok) {
      throw new Error(
        paymentJson.error ||
        'Unable to load payments'
      );
    }


    allPayments =
      Array.isArray(
        paymentJson.payments
      )
        ? paymentJson.payments
        : [];


    paymentMeta =
      paymentJson;


    renderDashboard();

    renderPaymentHistory();


    $('updated')
      .textContent =
        `Updated ${new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })}`;

  } catch (error) {

    console.error(error);

    $('updated')
      .textContent =
        error.message;

    $('connectionStatus')
      .textContent =
        '● CONNECTION ERROR';

    $('connectionStatus')
      .className =
        'connection error';
  }
}


/*
  ====================================
  COPY ZELLE
  ====================================
*/

$('copyZelle')
  .addEventListener(
    'click',
    async () => {

      const value =
        $('zelleValue')
          .textContent
          .trim();

      if (!value) {
        return;
      }

      try {
        await navigator.clipboard
          .writeText(value);

        $('copyZelle')
          .textContent =
            'COPIED ✓';

        setTimeout(
          () => {
            $('copyZelle')
              .textContent =
                'COPY';
          },
          1500
        );

      } catch {
        window.prompt(
          'Copy Zelle:',
          value
        );
      }
    }
  );


/*
  ====================================
  NAV
  ====================================
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

          const tab =
            button.dataset.tab;

          document
            .querySelectorAll(
              '[data-tab]'
            )
            .forEach(
              item =>
                item.classList.toggle(
                  'active',
                  item === button
                )
            );

          document
            .querySelectorAll(
              '.panel'
            )
            .forEach(
              panel => {
                panel.hidden =
                  panel.id !== tab;
              }
            );
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
