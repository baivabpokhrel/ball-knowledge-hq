const $ = (id) =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

let currentGw = 1;

let managers = [];

let allPayments = [];


/*
  =========================================
  HELPERS
  =========================================
*/

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function showMessage(
  message,
  type = ''
) {
  const element =
    $('adminMessage');

  element.textContent =
    message;

  element.className =
    'admin-message';

  if (type) {
    element.classList.add(
      type
    );
  }

  if (message) {
    setTimeout(() => {
      if (
        element.textContent ===
        message
      ) {
        element.textContent = '';

        element.className =
          'admin-message';
      }
    }, 2500);
  }
}


/*
  =========================================
  PAYMENT LOOKUPS
  =========================================
*/

function getPayment(
  gw,
  entryId
) {
  return (
    allPayments.find(
      row =>
        Number(row.gameweek) ===
          Number(gw) &&
        Number(row.entry_id) ===
          Number(entryId)
    ) || null
  );
}


function isPaid(
  gw,
  entryId
) {
  return (
    getPayment(
      gw,
      entryId
    )?.paid === true
  );
}


function isWinner(
  gw,
  entryId
) {
  return (
    getPayment(
      gw,
      entryId
    )?.winner === true
  );
}


function getWinner(gw) {
  return (
    managers.find(
      manager =>
        isWinner(
          gw,
          manager.entryId
        )
    ) || null
  );
}


function paidCount(gw) {
  return managers.filter(
    manager =>
      isPaid(
        gw,
        manager.entryId
      )
  ).length;
}


function isGwComplete(gw) {
  /*
    A Gameweek is considered complete
    only when every current league
    manager is marked paid.
  */

  return (
    managers.length > 0 &&
    paidCount(gw) ===
      managers.length
  );
}


/*
  =========================================
  GAMEWEEK LISTS
  =========================================
*/

function outstandingGameweeks() {
  const result = [];

  for (
    let gw = 1;
    gw <= currentGw;
    gw++
  ) {
    if (
      !isGwComplete(gw)
    ) {
      result.push(gw);
    }
  }

  /*
    Most recent first.
  */

  return result.reverse();
}


function completedGameweeks() {
  const result = [];

  for (
    let gw = 1;
    gw <= currentGw;
    gw++
  ) {
    if (
      isGwComplete(gw)
    ) {
      result.push(gw);
    }
  }

  return result.reverse();
}


/*
  =========================================
  RENDER ONE GW
  =========================================
*/

function renderGameweekCard(
  gw,
  open = false
) {
  const paid =
    paidCount(gw);

  const total =
    managers.length;

  const remaining =
    Math.max(
      0,
      total - paid
    );

  const winner =
    getWinner(gw);

  /*
    Unpaid managers first.
  */

  const sortedManagers =
    [...managers].sort(
      (a, b) => {

        const aPaid =
          isPaid(
            gw,
            a.entryId
          );

        const bPaid =
          isPaid(
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

        return String(
          a.team
        ).localeCompare(
          String(
            b.team
          )
        );
      }
    );


  const managerHtml =
    sortedManagers
      .map(
        manager => {

          const paid =
            isPaid(
              gw,
              manager.entryId
            );

          const winner =
            isWinner(
              gw,
              manager.entryId
            );

          return `
            <div class="admin-manager">

              <div class="manager-title">

                <strong>
                  ${escapeHtml(manager.team)}
                </strong>

                <small>
                  ${escapeHtml(manager.manager)}
                </small>

              </div>


              <div class="admin-options">

                <label
                  class="
                    admin-option
                    ${paid ? 'paid' : ''}
                  "
                >

                  <input
                    type="checkbox"

                    class="payment-checkbox"

                    data-gw="${gw}"

                    data-entry="${manager.entryId}"

                    ${paid ? 'checked' : ''}
                  >

                  Paid

                </label>


                <label
                  class="
                    admin-option
                    ${winner ? 'winner' : ''}
                  "
                >

                  <input
                    type="radio"

                    name="winner-gw-${gw}"

                    class="winner-radio"

                    data-gw="${gw}"

                    data-entry="${manager.entryId}"

                    ${winner ? 'checked' : ''}
                  >

                  Winner 🏆

                </label>

              </div>

            </div>
          `;
        }
      )
      .join('');


  return `
    <details
      class="gw-admin-card"
      data-gw-card="${gw}"
      ${open ? 'open' : ''}
    >

      <summary class="gw-summary">

        <div class="gw-summary-top">

          <div>

            <span class="gw-number">
              GW ${gw}
            </span>

            ${
              gw === currentGw
                ? `
                  <span class="gw-current">
                    CURRENT
                  </span>
                `
                : ''
            }

          </div>


          <div class="gw-payment-count">
            ${paid}/${total} paid
          </div>

        </div>


        <div class="gw-summary-bottom">

          ${
            remaining === 0
              ? '✓ All payments received'
              : `${remaining} payment${remaining === 1 ? '' : 's'} remaining`
          }

          ${
            winner
              ? ` • 🏆 ${escapeHtml(winner.team)}`
              : ''
          }

        </div>

      </summary>


      <div class="gw-body">


        <div class="gw-winner-summary">

          <div>

            <strong>
              ${
                winner
                  ? `🏆 ${escapeHtml(winner.team)}`
                  : '🏆 No winner selected'
              }
            </strong>

            <small>
              ${
                winner
                  ? escapeHtml(winner.manager)
                  : `GW${gw} winner`
              }
            </small>

          </div>


          ${
            winner
              ? `
                <button
                  type="button"

                  class="clear-winner-btn"

                  data-clear-winner="${gw}"
                >
                  Undo Winner
                </button>
              `
              : ''
          }

        </div>


        ${managerHtml}

      </div>

    </details>
  `;
}


/*
  =========================================
  RENDER OUTSTANDING
  =========================================
*/

function renderOutstanding() {
  const gws =
    outstandingGameweeks();

  if (
    gws.length === 0
  ) {
    $('outstandingList')
      .innerHTML = `
        <div class="empty-success">
          ✓ All Gameweek payments are complete.
        </div>
      `;

    return;
  }

  $('outstandingList')
    .innerHTML =
      gws.map(
        (gw, index) =>
          renderGameweekCard(
            gw,
            index === 0
          )
      ).join('');
}


/*
  =========================================
  COMPLETED DROPDOWN
  =========================================
*/

function renderCompletedDropdown() {
  const select =
    $('completedGwSelect');

  const previousValue =
    select.value;

  const gws =
    completedGameweeks();

  select.innerHTML = `
    <option value="">
      Select a completed GW
    </option>
  `;

  gws.forEach(
    gw => {
      const option =
        document.createElement(
          'option'
        );

      option.value =
        String(gw);

      option.textContent =
        `GW ${gw} — Complete`;

      select.appendChild(
        option
      );
    }
  );

  if (
    previousValue &&
    gws.includes(
      Number(previousValue)
    )
  ) {
    select.value =
      previousValue;
  }
}


/*
  =========================================
  RENDER ALL
  =========================================
*/

function renderEverything() {
  renderOutstanding();

  renderCompletedDropdown();

  bindControls();
}


/*
  =========================================
  EVENT BINDINGS
  =========================================
*/

function bindControls() {
  /*
    PAID CHECKBOXES
  */

  document
    .querySelectorAll(
      '.payment-checkbox'
    )
    .forEach(
      checkbox => {

        checkbox.addEventListener(
          'change',
          async () => {

            const gw =
              Number(
                checkbox.dataset.gw
              );

            const entryId =
              Number(
                checkbox.dataset.entry
              );

            const paid =
              checkbox.checked;

            checkbox.disabled =
              true;

            try {
              await saveChange({
                gameweek: gw,
                entryId,
                action: 'paid',
                value: paid
              });

              await refreshPaymentData();

              showMessage(
                paid
                  ? `GW${gw} payment marked paid ✓`
                  : `GW${gw} payment undone`,
                'success'
              );

            } catch (error) {
              checkbox.checked =
                !paid;

              showMessage(
                error.message,
                'error'
              );

            } finally {
              checkbox.disabled =
                false;
            }
          }
        );
      }
    );


  /*
    WINNER RADIOS
  */

  document
    .querySelectorAll(
      '.winner-radio'
    )
    .forEach(
      radio => {

        radio.addEventListener(
          'change',
          async () => {

            if (!radio.checked) {
              return;
            }

            const gw =
              Number(
                radio.dataset.gw
              );

            const entryId =
              Number(
                radio.dataset.entry
              );

            try {
              await saveChange({
                gameweek: gw,
                entryId,
                action: 'winner',
                value: true
              });

              await refreshPaymentData();

              showMessage(
                `GW${gw} winner updated 🏆`,
                'success'
              );

            } catch (error) {
              showMessage(
                error.message,
                'error'
              );

              await refreshPaymentData();
            }
          }
        );
      }
    );


  /*
    CLEAR WINNER
  */

  document
    .querySelectorAll(
      '[data-clear-winner]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async () => {

            const gw =
              Number(
                button.dataset
                  .clearWinner
              );

            if (
              !confirm(
                `Clear the GW${gw} winner?`
              )
            ) {
              return;
            }

            try {
              await saveChange({
                gameweek: gw,
                action:
                  'clearWinner'
              });

              await refreshPaymentData();

              showMessage(
                `GW${gw} winner removed`,
                'success'
              );

            } catch (error) {
              showMessage(
                error.message,
                'error'
              );
            }
          }
        );
      }
    );
}


/*
  =========================================
  ADMIN SAVE
  =========================================
*/

async function saveChange({
  gameweek,
  entryId = null,
  action,
  value = null
}) {
  const password =
    $('password')
      .value
      .trim();

  if (!password) {
    $('password').focus();

    throw new Error(
      'Enter your admin password first.'
    );
  }

  const response =
    await fetch(
      '/api/admin/payment',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({
            password,
            gameweek,
            entryId,
            action,
            value
          })
      }
    );

  const result =
    await response.json();

  if (!response.ok) {
    throw new Error(
      result.error ||
      'Unable to save change'
    );
  }

  return result;
}


/*
  =========================================
  LOAD FPL MANAGERS
  =========================================
*/

async function loadManagers() {
  const response =
    await fetch(
      `/api/dashboard?leagueId=${LEAGUE_ID}`,
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
      'Unable to load FPL league'
    );
  }

  currentGw =
    Number(
      dashboard.gameweek?.id ||
      1
    );

  managers =
    Array.isArray(
      dashboard.managers
    )
      ? dashboard.managers
      : [];

  $('currentGwLabel')
    .textContent =
      `Current FPL Gameweek • GW ${currentGw}`;
}


/*
  =========================================
  LOAD ALL PAYMENTS
  =========================================
*/

async function loadAllPayments() {
  const response =
    await fetch(
      `/api/payments?from=1&to=${currentGw}`,
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
      'Unable to load payment history'
    );
  }

  allPayments =
    Array.isArray(
      data.payments
    )
      ? data.payments
      : [];
}


/*
  =========================================
  REFRESH AFTER SAVE
  =========================================
*/

async function refreshPaymentData() {
  await loadAllPayments();

  renderEverything();

  /*
    Refresh selected completed GW too,
    because undoing a payment can move
    it back to outstanding.
  */

  const selected =
    Number(
      $('completedGwSelect')
        .value
    );

  if (selected) {
    renderCompletedGw(
      selected
    );
  }
}


/*
  =========================================
  COMPLETED GW VIEW
  =========================================
*/

function renderCompletedGw(gw) {
  if (!gw) {
    $('completedGwContainer')
      .innerHTML = '';

    return;
  }

  $('completedGwContainer')
    .innerHTML =
      renderGameweekCard(
        gw,
        true
      );

  bindControls();
}


$('completedGwSelect')
  .addEventListener(
    'change',
    event => {

      const gw =
        Number(
          event.target.value
        );

      renderCompletedGw(
        gw
      );
    }
  );


/*
  =========================================
  INITIAL LOAD
  =========================================
*/

async function init() {
  try {
    $('lastUpdated')
      .textContent =
        'Loading…';

    await loadManagers();

    await loadAllPayments();

    renderEverything();

    $('lastUpdated')
      .textContent =
        `Updated ${new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })}`;

  } catch (error) {
    console.error(error);

    $('outstandingList')
      .innerHTML = `
        <div class="empty">
          ${escapeHtml(error.message)}
        </div>
      `;

    showMessage(
      error.message,
      'error'
    );
  }
}


init();
