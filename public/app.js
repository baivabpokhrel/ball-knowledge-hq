const $ = (id) =>
  document.getElementById(id);

const LEAGUE_ID = '92378';

const GW_ENTRY_FEE = 20;

const VALID_TABS = [
  'gameweek',
  'payments',
  'predictions',
  'overall'
];


let dashboardData = null;

let allPayments = [];

let allGwSettings = [];

let paymentMeta = null;

let activeShareGw = null;


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
    dashboardData?.gameweek?.id ||
    1
  );
}


/* =====================================================
   URL / SHAREABLE TAB HELPERS
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


function getRequestedPaymentGw() {
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
  gw = null
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
    GW only belongs to the
    Payments screen.
  */

  if (
    tab === 'payments' &&
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

  window.history.pushState(
    {
      tab,
      gw
    },
    '',
    url
  );
}


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

  /*
    Close all other GWs.
  */

  document
    .querySelectorAll(
      '.payment-gw-card'
    )
    .forEach(
      item => {
        item.open =
          item === card;
      }
    );

  card.open = true;

  if (scroll) {
    setTimeout(
      () => {
        card.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      },
      100
    );
  }
}


async function openTab(
  tab,
  options = {}
) {
  if (
    !VALID_TABS.includes(tab)
  ) {
    tab = 'gameweek';
  }

  const {
    updateHistory = true,
    gw = null,
    scroll = true
  } = options;


  /*
    Nav buttons
  */

  document
    .querySelectorAll(
      '[data-tab]'
    )
    .forEach(
      button => {
        button.classList.toggle(
          'active',
          button.dataset.tab === tab
        );
      }
    );


  /*
    Panels
  */

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


  /*
    Always fetch fresh payment data
    when Payments is opened.
  */

  if (
    tab === 'payments' &&
    dashboardData
  ) {
    await refreshPaymentsOnly();

    if (gw) {
      openRequestedPaymentGw(
        gw,
        scroll
      );
    }
  }


  if (updateHistory) {
    updateUrl(
      tab,
      tab === 'payments'
        ? gw
        : null
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
      top: 0,
      behavior: 'smooth'
    });
  }
}


/* =====================================================
   PAYMENT DATABASE HELPERS
===================================================== */

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
        Number(item.gameweek) ===
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
        Number(item.gameweek) ===
          Number(gw) &&
        item.winner === true
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
        Number(manager.entryId) ===
        Number(row.entry_id)
    ) ||
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
   MAIN DASHBOARD
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
    $('league').textContent =
      data.league?.name ||
      'Ball Knowledge Only';
  }


  if ($('connectionStatus')) {
    $('connectionStatus').textContent =
      `● FPL CONNECTED • ${managers.length} MANAGERS`;

    $('connectionStatus').className =
      'connection connected';
  }


  if ($('gw')) {
    $('gw').textContent =
      data.gameweek?.id ||
      '—';
  }


  if ($('statusCode')) {
    $('statusCode').textContent =
      data.gameweek
        ?.status
        ?.code ||
      '—';
  }


  if ($('statusText')) {
    $('statusText').textContent =
      data.gameweek
        ?.status
        ?.label ||
      '';
  }


  if ($('weeklyList')) {
    $('weeklyList').innerHTML =
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
            No Gameweek points yet.
          </div>
        `;
  }


  if ($('overallList')) {
    $('overallList').innerHTML =
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
            No overall standings yet.
          </div>
        `;
  }


  renderAward();
}


/* =====================================================
   CURRENT GW AWARD
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
    if ($('awardTitle')) {
      $('awardTitle').textContent =
        'Waiting for Gameweek';
    }

    if ($('awardText')) {
      $('awardText').textContent =
        'No leader yet';
    }

    if ($('awardNote')) {
      $('awardNote').textContent =
        'Standings begin after the deadline.';
    }

    return;
  }


  if (status?.final) {
    const winners =
      data.awards
        ?.winners ||
      [];


    if ($('awardTitle')) {
      $('awardTitle').textContent =
        winners.length > 1
          ? 'Official GW Winners'
          : 'Official GW Winner';
    }


    if ($('awardText')) {
      $('awardText').textContent =
        winners.length
          ? winners
              .map(
                winner =>
                  `${winner.team} — ${winner.gameweekPoints} pts`
              )
              .join(', ')
          : '—';
    }


    if ($('awardNote')) {
      $('awardNote').textContent =
        'Official after FPL checks.';
    }

    return;
  }


  const leaders =
    data.awards
      ?.provisionalLeader ||
    [];


  if ($('awardTitle')) {
    $('awardTitle').textContent =
      'Provisional Leader';
  }


  if ($('awardText')) {
    $('awardText').textContent =
      leaders.length
        ? leaders
            .map(
              leader =>
                `${leader.team} — ${leader.gameweekPoints} pts`
            )
            .join(', ')
        : '—';
  }


  if ($('awardNote')) {
    $('awardNote').textContent =
      'Points may still change.';
  }
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
    $('fee').textContent =
      GW_ENTRY_FEE;
  }


  /*
    Hide old global Zelle card.
    Zelle is now per-GW.
  */

  if ($('zelleValue')) {
    const oldZelleCard =
      $('zelleValue').closest(
        '.zelle-card'
      );

    if (oldZelleCard) {
      oldZelleCard.style.display =
        'none';
    }
  }


  const currentGw =
    getCurrentGw();


  const managers =
    Array.isArray(
      dashboardData.managers
    )
      ? dashboardData.managers
      : [];


  const requestedGw =
    getRequestedPaymentGw();


  const cards = [];


  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {

    const zelle =
      zelleForGw(gw);


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
      manualWinnerForGw(gw);


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
              winner &&
              Number(winner.entryId) ===
              Number(a.entryId);


            const bWinner =
              winner &&
              Number(winner.entryId) ===
              Number(b.entryId);


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
              Number(winner.entryId) ===
              Number(manager.entryId);


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
                winner
                  ? `🏆 ${escapeHtml(winner.team)}`
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
                winner
                  ? ` • Payment goes to ${escapeHtml(winner.team)}`
                  : ''
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
    $('paymentHistory').innerHTML =
      cards.join('');
  }


  bindPaymentButtons();


  /*
    When URL contains ?gw=3,
    make sure GW3 is open.
  */

  if (requestedGw) {
    openRequestedPaymentGw(
      requestedGw,
      false
    );
  }
}


/* =====================================================
   UPDATE URL WHEN USER OPENS A PAYMENT GW
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
              Close other payment cards.
            */

            document
              .querySelectorAll(
                '.payment-gw-card'
              )
              .forEach(
                other => {
                  if (other !== card) {
                    other.open = false;
                  }
                }
              );


            /*
              Make this exact GW shareable.
            */

            const url =
              new URL(
                window.location.href
              );

            url.searchParams.set(
              'tab',
              'payments'
            );

            url.searchParams.set(
              'gw',
              gw
            );


            window.history.replaceState(
              {
                tab: 'payments',
                gw
              },
              '',
              url
            );
          }
        );
      }
    );
}


/* =====================================================
   PAYMENT BUTTON EVENTS
===================================================== */

function bindPaymentButtons() {

  /*
    Copy Zelle
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


            const value =
              zelleForGw(gw);


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
                button.textContent;


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
    Share reminder
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


            const gw =
              Number(
                button.dataset
                  .shareGw
              );


            openShareModal(
              gw
            );
          }
        );
      }
    );


  /*
    Copy reminder text
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


  bindPaymentCardUrlEvents();
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
    zelleForGw(gw) ||
    'Not entered yet';


  if (
    unpaid.length === 0
  ) {
    return (
      `🏆 BALL KNOWLEDGE ONLY\n` +
      `GW${gw} PAYMENT UPDATE\n\n` +
      `✅ Everyone has paid for GW${gw}.`
    );
  }


  const names =
    unpaid
      .map(
        manager =>
          `• ${manager.team} — ${manager.manager}`
      )
      .join('\n');


  const link =
    `${window.location.origin}/?tab=payments&gw=${gw}`;


  return (
    `💰 BALL KNOWLEDGE ONLY\n` +
    `GW${gw} PAYMENT REMINDER\n\n` +
    `$20 per player\n` +
    `Zelle: ${zelle}\n\n` +
    `Still unpaid:\n` +
    `${names}\n\n` +
    `${unpaid.length} payment${unpaid.length === 1 ? '' : 's'} remaining.\n\n` +
    `View GW${gw} payments:\n${link}`
  );
}


/* =====================================================
   COPY REMINDER
===================================================== */

async function copyReminder(gw) {

  const text =
    buildReminderText(gw);


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
    unpaidManagersForGw(gw);


  const zelle =
    zelleForGw(gw);


  if ($('shareModalTitle')) {
    $('shareModalTitle').textContent =
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
                  ${escapeHtml(manager.team)}
                </strong>

                <small>
                  ${escapeHtml(manager.manager)}
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


  const cardTitle =
    document.querySelector(
      '.share-card-gw'
    );


  if (cardTitle) {
    cardTitle.textContent =
      `GW ${gw} PAYMENT REMINDER`;
  }


  if ($('shareModal')) {
    $('shareModal').hidden =
      false;
  }


  document.body
    .classList.add(
      'modal-open'
    );
}


function closeShareModal() {

  if ($('shareModal')) {
    $('shareModal').hidden =
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
   CANVAS TEXT WRAPPING
===================================================== */

function wrapCanvasText(
  ctx,
  text,
  maxWidth
) {
  const words =
    String(text)
      .split(' ');


  const lines = [];

  let line = '';


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
      width > maxWidth &&
      line
    ) {
      lines.push(line);

      line =
        word;

    } else {
      line =
        testLine;
    }
  }


  if (line) {
    lines.push(line);
  }


  return lines;
}


/* =====================================================
   CREATE PAYMENT REMINDER IMAGE
===================================================== */

function createReminderCanvas(gw) {

  const unpaid =
    unpaidManagersForGw(gw);


  const zelle =
    zelleForGw(gw);


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
    Background
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
    Brand
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
    GW title
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
    Entry / remaining
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
    Zelle
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
    All paid
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
          Warning circle
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
          Team
        */

        ctx.fillStyle =
          '#FFFFFF';


        ctx.font =
          '700 31px Arial';


        ctx.fillText(
          manager.team,
          155,
          y + 53
        );


        /*
          Manager
        */

        ctx.fillStyle =
          '#969DA6';


        ctx.font =
          '25px Arial';


        ctx.fillText(
          manager.manager,
          155,
          y + 90
        );


        y +=
          rowHeight;
      }
    );
  }


  /*
    Footer
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
   SHARE PAYMENT IMAGE
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
      Native mobile share sheet.
    */

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({
        files: [file]
      })
    ) {

      await navigator.share({

        title:
          `GW${gw} Payment Reminder`,

        text:
          `Ball Knowledge Only — GW${gw} payment reminder`,

        files:
          [file]

      });


      return;
    }


    /*
      Browser fallback.
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
   REFRESH PAYMENT DATA ONLY
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


    if ($('updated')) {
      $('updated').textContent =
        `Payments updated ${new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })}`;
    }


  } catch (error) {

    console.error(
      'Payment refresh failed:',
      error
    );
  }
}


/* =====================================================
   LOAD APP
===================================================== */

async function loadEverything() {

  if ($('updated')) {
    $('updated').textContent =
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
      $('updated').textContent =
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
      $('updated').textContent =
        error.message;
    }


    if ($('connectionStatus')) {
      $('connectionStatus').textContent =
        '● CONNECTION ERROR';

      $('connectionStatus').className =
        'connection error';
    }
  }
}


/* =====================================================
   NAV BUTTONS
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


          await openTab(
            tab,
            {
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
   BROWSER BACK / FORWARD
===================================================== */

window.addEventListener(
  'popstate',
  async () => {

    const tab =
      getRequestedTab();


    const gw =
      tab === 'payments'
        ? getRequestedPaymentGw()
        : null;


    await openTab(
      tab,
      {
        updateHistory:
          false,

        gw,

        scroll:
          true
      }
    );
  }
);


/* =====================================================
   SHARE MODAL EVENTS
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


        const copied =
          await copyReminder(
            activeShareGw
          );


        if (copied) {
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
   MAIN REFRESH BUTTON
===================================================== */

if ($('refresh')) {
  $('refresh')
    .addEventListener(
      'click',
      async () => {

        await loadEverything();


        const tab =
          getRequestedTab();


        const gw =
          tab === 'payments'
            ? getRequestedPaymentGw()
            : null;


        await openTab(
          tab,
          {
            updateHistory:
              false,

            gw,

            scroll:
              false
          }
        );
      }
    );
}


/* =====================================================
   REFRESH WHEN RETURNING TO PAGE
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
   LIGHT AUTO REFRESH
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
   START
===================================================== */

async function startApp() {

  /*
    Load FPL + payments first.
  */

  await loadEverything();


  /*
    Then inspect shared URL.
  */

  const requestedTab =
    getRequestedTab();


  const requestedGw =
    requestedTab === 'payments'
      ? getRequestedPaymentGw()
      : null;


  /*
    Do not create another history entry
    on initial page load.
  */

  await openTab(
    requestedTab,
    {
      updateHistory:
        false,

      gw:
        requestedGw,

      scroll:
        false
    }
  );
}


startApp();
