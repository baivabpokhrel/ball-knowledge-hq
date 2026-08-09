const $ = id =>
  document.getElementById(id);

const LEAGUE_ID = '92378';

let dashboardData = null;
let allPayments = [];
let paymentMeta = null;

let activeShareGw = null;


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

  return (
    dashboardData.managers.find(
      manager =>
        Number(manager.entryId) ===
        Number(row.entry_id)
    ) || null
  );
}


function unpaidManagersForGw(gw) {
  if (!dashboardData) {
    return [];
  }

  return dashboardData.managers.filter(
    manager =>
      !paidFor(
        gw,
        manager.entryId
      )
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
  CURRENT GW DASHBOARD
  ====================================
*/

function renderDashboard() {
  const data =
    dashboardData;

  if (!data) {
    return;
  }

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


  $('league')
    .textContent =
      data.league?.name ||
      'Ball Knowledge Only';


  $('connectionStatus')
    .textContent =
      `● FPL CONNECTED • ${managers.length} MANAGERS`;


  $('connectionStatus')
    .className =
      'connection connected';


  $('gw')
    .textContent =
      data.gameweek?.id ||
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
            No Gameweek points yet.
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
      data.awards?.winners ||
      [];

    $('awardTitle')
      .textContent =
        winners.length > 1
          ? 'Official GW Winners'
          : 'Official GW Winner';

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
        ? leaders
            .map(
              leader =>
                `${leader.team} — ${leader.gameweekPoints} pts`
            )
            .join(', ')
        : '—';


  $('awardNote')
    .textContent =
      'Points may still change.';
}


/*
  ====================================
  PAYMENT HISTORY
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


  const managers =
    dashboardData.managers;


  const cards = [];


  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {

    const paidCount =
      managers.filter(
        manager =>
          paidFor(
            gw,
            manager.entryId
          )
      ).length;


    const remaining =
      managers.length -
      paidCount;


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
                    ${
                      isWinner
                        ? 'winner-label'
                        : ''
                    }
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


  bindPaymentShareButtons();
}


/*
  ====================================
  PAYMENT REMINDER TEXT
  ====================================
*/

function buildReminderText(gw) {
  const unpaid =
    unpaidManagersForGw(gw);

  const fee =
    paymentMeta?.fee ||
    '';

  const zelle =
    paymentMeta?.zelle ||
    '';


  if (
    unpaid.length === 0
  ) {
    return (
      `🏆 BALL KNOWLEDGE ONLY\n` +
      `GW${gw} PAYMENT UPDATE\n\n` +
      `✅ Everyone has paid for GW${gw}.\n\n` +
      `No luck. Only stats.`
    );
  }


  const names =
    unpaid
      .map(
        manager =>
          `• ${manager.team} — ${manager.manager}`
      )
      .join('\n');


  return (
    `💰 BALL KNOWLEDGE ONLY\n` +
    `GW${gw} PAYMENT REMINDER\n\n` +
    `$${fee} per player\n` +
    `Zelle: ${zelle}\n\n` +
    `Still unpaid:\n` +
    `${names}\n\n` +
    `${unpaid.length} payment${unpaid.length === 1 ? '' : 's'} remaining.`
  );
}


/*
  ====================================
  SHARE PREVIEW
  ====================================
*/

function openShareModal(gw) {
  activeShareGw =
    gw;


  const unpaid =
    unpaidManagersForGw(gw);


  $('shareModalTitle')
    .textContent =
      `GW ${gw}`;


  const body =
    $('sharePreviewBody');


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

          <span>
            ENTRY
          </span>

          <strong>
            $${escapeHtml(paymentMeta.fee)}
          </strong>

        </div>

        <div>

          <span>
            REMAINING
          </span>

          <strong>
            ${unpaid.length}
          </strong>

        </div>

      </div>


      <div class="share-zelle">

        <span>
          ZELLE
        </span>

        <strong>
          ${escapeHtml(paymentMeta.zelle)}
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

  cardTitle.textContent =
    `GW ${gw} PAYMENT REMINDER`;


  $('shareModal')
    .hidden =
      false;


  document.body
    .classList.add(
      'modal-open'
    );
}


function closeShareModal() {
  $('shareModal')
    .hidden =
      true;

  activeShareGw =
    null;

  document.body
    .classList.remove(
      'modal-open'
    );
}


/*
  ====================================
  COPY REMINDER
  ====================================
*/

async function copyReminder(gw) {
  const text =
    buildReminderText(gw);

  try {

    await navigator
      .clipboard
      .writeText(text);

    return true;

  } catch {

    window.prompt(
      'Copy payment reminder:',
      text
    );

    return false;
  }
}


/*
  ====================================
  GENERATE PNG USING CANVAS
  ====================================
*/

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
      width >
        maxWidth &&
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


function createReminderCanvas(gw) {
  const unpaid =
    unpaidManagersForGw(gw);

  const scale = 2;

  const width = 1080;

  const rowHeight = 135;

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
    Gold top rule
  */

  ctx.fillStyle =
    '#D6AD55';

  ctx.fillRect(
    70,
    70,
    150,
    10
  );


  /*
    Brand
  */

  ctx.fillStyle =
    '#D6AD55';

  ctx.font =
    '700 30px Arial';

  ctx.fillText(
    'BALL KNOWLEDGE ONLY',
    70,
    135
  );


  /*
    Title
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
    Entry and remaining
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
    `$${paymentMeta?.fee || ''}`,
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
    'SEND VIA ZELLE',
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
      paymentMeta?.zelle ||
        '',
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

        /*
          Divider
        */

        ctx.strokeStyle =
          '#272B31';

        ctx.lineWidth = 2;

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


/*
  ====================================
  SHARE GENERATED IMAGE
  ====================================
*/

async function shareReminderImage(gw) {
  const button =
    $('shareReminderImage');


  button.disabled =
    true;

  button.textContent =
    'Creating…';


  try {

    const canvas =
      createReminderCanvas(gw);


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
        [
          blob
        ],
        `ball-knowledge-gw${gw}-payment-reminder.png`,
        {
          type:
            'image/png'
        }
      );


    /*
      Native mobile sharing
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

        files: [
          file
        ]
      });

      return;
    }


    /*
      Fallback:
      generate downloadable image
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

    /*
      User cancelling the share sheet
      is not really an error.
    */

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

    button.disabled =
      false;

    button.textContent =
      'Share Image';
  }
}


/*
  ====================================
  SHARE BUTTON EVENTS
  ====================================
*/

function bindPaymentShareButtons() {

  document
    .querySelectorAll(
      '[data-share-gw]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

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


/*
  ====================================
  LOAD EVERYTHING
  ====================================
*/

async function loadEverything() {

  $('updated')
    .textContent =
      'Updating…';


  try {

    /*
      FPL
    */

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


    /*
      Payments
    */

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

        await navigator
          .clipboard
          .writeText(
            value
          );


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
  MODAL EVENTS
  ====================================
*/

$('closeShare')
  .addEventListener(
    'click',
    closeShareModal
  );


document
  .querySelectorAll(
    '[data-close-share]'
  )
  .forEach(
    element => {

      element
        .addEventListener(
          'click',
          closeShareModal
        );
    }
  );


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

        $('copyReminder')
          .textContent =
            'Copied ✓';


        setTimeout(
          () => {

            $('copyReminder')
              .textContent =
                'Copy Text';

          },
          1500
        );
      }
    }
  );


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
          method: 'GET',

          cache: 'no-store',

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


    paymentMeta =
      data;


    /*
      Immediately repaint payment screen.
    */

    renderPaymentHistory();


    console.log(
      'Payments refreshed:',
      new Date(),
      data.requestId
    );


  } catch (error) {

    console.error(
      'Payment refresh failed:',
      error
    );
  }
}
/*
  ====================================
  NAVIGATION
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
                  tab;
              }
            );


          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
      );
    }
  );


/*
  ====================================
  REFRESH
  ====================================
*/

$('refresh')
  .addEventListener(
    'click',
    loadEverything
  );


/*
  START
*/

loadEverything();
