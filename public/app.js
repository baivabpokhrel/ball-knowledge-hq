const $ = (id) =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

const GW_ENTRY_FEE =
  20;


let dashboardData =
  null;

let allPayments =
  [];

let allGwSettings =
  [];

let paymentMeta =
  null;

let activeShareGw =
  null;


/* =====================================================
   HELPERS
===================================================== */

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
        Number(
          item.gameweek
        ) ===
          Number(gw) &&
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


function manualWinnerForGw(gw) {

  if (!dashboardData) {
    return null;
  }


  const row =
    allPayments.find(
      item =>
        Number(
          item.gameweek
        ) ===
          Number(gw) &&
        item.winner ===
          true
    );


  if (!row) {
    return null;
  }


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  return (
    managers.find(
      manager =>
        Number(
          manager.entryId
        ) ===
        Number(
          row.entry_id
        )
    ) ||
    null
  );
}


function unpaidManagersForGw(gw) {

  if (!dashboardData) {
    return [];
  }


  return dashboardData
    .managers
    .filter(
      manager =>
        !paidFor(
          gw,
          manager.entryId
        )
    );
}


/* =====================================================
   STANDINGS
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


/* =====================================================
   DASHBOARD
===================================================== */

function renderDashboard() {

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


  if ($('gw')) {

    $('gw')
      .textContent =
        data.gameweek?.id ||
        '—';

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


  if ($('weeklyList')) {

    $('weeklyList')
      .innerHTML =
        weekly.length
          ? weekly.map(
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

  }


  if ($('overallList')) {

    $('overallList')
      .innerHTML =
        overall.length
          ? overall.map(
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

  }


  renderAward();
}


/* =====================================================
   AWARD
===================================================== */

function renderAward() {

  if (!dashboardData) {
    return;
  }


  const data =
    dashboardData;


  const status =
    data.gameweek
      ?.status;


  if (
    status?.code ===
    'PRE-SEASON'
  ) {

    $('awardTitle').textContent =
      'Waiting for Gameweek';

    $('awardText').textContent =
      'No leader yet';

    $('awardNote').textContent =
      'Standings begin after the deadline.';

    return;
  }


  if (
    status?.final
  ) {

    const winners =
      data.awards
        ?.winners ||
      [];


    $('awardTitle').textContent =
      winners.length > 1
        ? 'Official GW Winners'
        : 'Official GW Winner';


    $('awardText').textContent =
      winners.length
        ? winners.map(
            winner =>
              `${winner.team} — ${winner.gameweekPoints} pts`
          ).join(', ')
        : '—';


    $('awardNote').textContent =
      'Official after FPL checks.';


    return;
  }


  const leaders =
    data.awards
      ?.provisionalLeader ||
    [];


  $('awardTitle').textContent =
    'Provisional Leader';


  $('awardText').textContent =
    leaders.length
      ? leaders.map(
          leader =>
            `${leader.team} — ${leader.gameweekPoints} pts`
        ).join(', ')
      : '—';


  $('awardNote').textContent =
    'Points may still change.';
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


  /*
    Existing header fee stays $20.
  */

  if ($('fee')) {

    $('fee')
      .textContent =
        GW_ENTRY_FEE;

  }


  /*
    Existing top-level Zelle section is not
    useful anymore because Zelle is per-GW.

    Hide it if it still exists in index.html.
  */

  const topZelle =
    $('zelleValue');


  if (
    topZelle
  ) {

    const zelleCard =
      topZelle.closest(
        '.zelle-card'
      );


    if (zelleCard) {

      zelleCard.style.display =
        'none';

    }
  }


  const currentGw =
    Number(
      dashboardData
        .gameweek
        ?.id ||
      1
    );


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


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


    const winner =
      manualWinnerForGw(
        gw
      );


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
              a.team
            ).localeCompare(
              String(
                b.team
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
              $20 entry • ${
                winner
                  ? `Payment goes to ${escapeHtml(winner.team)}`
                  : 'Winner has not been selected yet'
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


  $('paymentHistory')
    .innerHTML =
      cards.join('');


  bindPaymentButtons();
}


/* =====================================================
   BIND PAYMENT BUTTONS
===================================================== */

function bindPaymentButtons() {

  /*
    COPY GW ZELLE
  */

  document
    .querySelectorAll(
      '[data-copy-zelle]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async () => {

            const gw =
              Number(
                button.dataset
                  .copyZelle
              );


            const value =
              zelleForGw(
                gw
              );


            if (!value) {
              return;
            }


            try {

              await navigator
                .clipboard
                .writeText(
                  value
                );


              const original =
                button
                  .textContent;


              button.textContent =
                'COPIED ✓';


              setTimeout(
                () => {

                  button.textContent =
                    original;

                },
                1400
              );


            } catch {

              window.prompt(
                `GW${gw} Zelle:`,
                value
              );

            }
          }
        );
      }
    );


  /*
    SHARE REMINDER
  */

  document
    .querySelectorAll(
      '[data-share-gw]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

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


  /*
    COPY REMINDER TEXT
  */

  document
    .querySelectorAll(
      '[data-copy-gw]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async () => {

            const gw =
              Number(
                button.dataset
                  .copyGw
              );


            const copied =
              await copyReminder(
                gw
              );


            if (copied) {

              const original =
                button.textContent;


              button.textContent =
                '✓ Copied';


              setTimeout(
                () => {

                  button.textContent =
                    original;

                },
                1400
              );

            }
          }
        );
      }
    );
}


/* =====================================================
   REMINDER TEXT
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


  if (
    unpaid.length ===
    0
  ) {

    return (
      `🏆 BALL KNOWLEDGE ONLY\n` +
      `GW${gw} PAYMENT UPDATE\n\n` +
      `✅ Everyone has paid for GW${gw}.`
    );

  }


  const names =
    unpaid.map(
      manager =>
        `• ${manager.team} — ${manager.manager}`
    ).join('\n');


  return (
    `💰 BALL KNOWLEDGE ONLY\n` +
    `GW${gw} PAYMENT REMINDER\n\n` +
    `$20 per player\n` +
    `Zelle: ${zelle}\n\n` +
    `Still unpaid:\n` +
    `${names}\n\n` +
    `${unpaid.length} payment${unpaid.length === 1 ? '' : 's'} remaining.`
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


  if (
    $('shareModalTitle')
  ) {

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
    unpaid.length ===
    0
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
      unpaid.map(
        manager => `
          <div class="share-unpaid-row">

            <div class="share-warning">
              !
            </div>

            <div>

              <strong>
                ${escapeHtml(manager.team)}
              </strong>

              <small>
                ${escapeHtml(manager.manager)}
              </small>

            </div>

          </div>
        `
      ).join('');


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
   PAYMENT REFRESH
===================================================== */

async function refreshPaymentsOnly() {

  if (!dashboardData) {
    return;
  }


  const currentGw =
    Number(
      dashboardData
        .gameweek
        ?.id ||
      1
    );


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


  } catch (error) {

    console.error(
      'Payment refresh failed:',
      error
    );

  }
}


/* =====================================================
   LOAD EVERYTHING
===================================================== */

async function loadEverything() {

  if ($('updated')) {

    $('updated')
      .textContent =
        'Updating…';

  }


  try {

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


    renderDashboard();


    await refreshPaymentsOnly();


    if ($('updated')) {

      $('updated')
        .textContent =
          `Updated ${new Date().toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
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
  }
}


/* =====================================================
   NAVIGATION
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
            button.dataset.tab;


          document
            .querySelectorAll(
              '[data-tab]'
            )
            .forEach(
              item =>
                item.classList
                  .toggle(
                    'active',
                    item ===
                      button
                  )
            );


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


          if (
            tab ===
            'payments'
          ) {

            await refreshPaymentsOnly();

          }


          window.scrollTo({
            top:
              0,

            behavior:
              'smooth'
          });
        }
      );
    }
  );


/* =====================================================
   MODAL BUTTONS
===================================================== */

$('closeShare')
  ?.addEventListener(
    'click',
    closeShareModal
  );


document
  .querySelectorAll(
    '[data-close-share]'
  )
  .forEach(
    element =>
      element.addEventListener(
        'click',
        closeShareModal
      )
  );


$('copyReminder')
  ?.addEventListener(
    'click',
    async () => {

      if (!activeShareGw) {
        return;
      }


      await copyReminder(
        activeShareGw
      );
    }
  );


/*
  NOTE:
  Keep your existing image-sharing function
  if you already have it.

  This text button will still work.
*/


/* =====================================================
   REFRESH
===================================================== */

$('refresh')
  ?.addEventListener(
    'click',
    loadEverything
  );


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
   START
===================================================== */

loadEverything();
