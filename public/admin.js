const $ = id =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

let gameweek = 1;
let managers = [];
let payments = [];


/*
  HELPERS
*/

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function getPayment(
  entryId
) {
  return (
    payments.find(
      item =>
        Number(
          item.entry_id
        ) ===
        Number(entryId)
    ) || null
  );
}


function isPaid(
  entryId
) {
  return (
    getPayment(entryId)
      ?.paid === true
  );
}


function isWinner(
  entryId
) {
  return (
    getPayment(entryId)
      ?.winner === true
  );
}


/*
  RENDER
*/

function render() {
  $('adminGw')
    .textContent =
      gameweek;

  const total =
    managers.length;

  const paidCount =
    managers.filter(
      manager =>
        isPaid(
          manager.entryId
        )
    ).length;

  const winner =
    managers.find(
      manager =>
        isWinner(
          manager.entryId
        )
    );


  $('adminTotals')
    .innerHTML = `
      <div class="admin-summary-grid">

        <div>
          <strong>
            ${paidCount} / ${total}
          </strong>

          <small>
            Paid
          </small>
        </div>

        <div>
          <strong>
            ${
              winner
                ? '🏆'
                : '—'
            }
          </strong>

          <small>
            ${
              winner
                ? escapeHtml(
                    winner.team
                  )
                : 'No winner'
            }
          </small>
        </div>

      </div>
    `;


  /*
    Unpaid first.
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


  $('adminList')
    .innerHTML =
      sorted
        .map(
          manager => {

            const paid =
              isPaid(
                manager.entryId
              );

            const winner =
              isWinner(
                manager.entryId
              );

            return `
              <div
                class="
                  admin-manager-card
                  ${
                    winner
                      ? 'admin-winner'
                      : ''
                  }
                "
              >

                <div class="admin-manager-head">

                  <div class="manager-info">

                    <strong>
                      ${escapeHtml(manager.team)}
                    </strong>

                    <small>
                      ${escapeHtml(manager.manager)}
                    </small>

                  </div>

                  ${
                    winner
                      ? `
                        <span class="winner-mini">
                          🏆 WINNER
                        </span>
                      `
                      : ''
                  }

                </div>


                <div class="admin-actions">

                  <button
                    type="button"
                    class="
                      admin-action
                      ${
                        paid
                          ? 'paid-action'
                          : 'unpaid-action'
                      }
                    "
                    data-action="paid"
                    data-entry="${manager.entryId}"
                    data-value="${!paid}"
                  >
                    ${
                      paid
                        ? '✓ PAID'
                        : 'MARK PAID'
                    }
                  </button>


                  <button
                    type="button"
                    class="
                      admin-action
                      winner-action
                      ${
                        winner
                          ? 'winner-active'
                          : ''
                      }
                    "
                    data-action="winner"
                    data-entry="${manager.entryId}"
                    data-value="${!winner}"
                  >
                    ${
                      winner
                        ? '🏆 WINNER'
                        : 'MARK WINNER'
                    }
                  </button>

                </div>

              </div>
            `;
          }
        )
        .join('');


  document
    .querySelectorAll(
      '.admin-action'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            updateRecord(
              Number(
                button.dataset
                  .entry
              ),

              button.dataset
                .action,

              button.dataset
                .value ===
                'true'
            );
          }
        );
      }
    );
}


/*
  LOAD DATA
*/

async function load() {
  $('adminList')
    .innerHTML = `
      <div class="empty">
        Loading managers…
      </div>
    `;

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

    if (
      !dashboardResponse.ok
    ) {
      throw new Error(
        dashboard.error ||
        'Unable to load league'
      );
    }


    gameweek =
      dashboard.gameweek
        ?.id ||
      1;

    managers =
      Array.isArray(
        dashboard.managers
      )
        ? dashboard.managers
        : [];


    const paymentResponse =
      await fetch(
        `/api/payments?gw=${gameweek}`,
        {
          cache:
            'no-store'
        }
      );

    const paymentData =
      await paymentResponse
        .json();

    if (
      !paymentResponse.ok
    ) {
      throw new Error(
        paymentData.error ||
        'Unable to load payments'
      );
    }

    payments =
      Array.isArray(
        paymentData.payments
      )
        ? paymentData.payments
        : [];

    render();

  } catch (error) {
    console.error(
      error
    );

    $('adminList')
      .innerHTML = `
        <div class="empty">
          ${escapeHtml(error.message)}
        </div>
      `;
  }
}


/*
  UPDATE
*/

async function updateRecord(
  entryId,
  action,
  value
) {
  const password =
    $('password')
      .value;

  if (!password) {
    alert(
      'Enter your admin password first.'
    );

    $('password')
      .focus();

    return;
  }


  const manager =
    managers.find(
      item =>
        Number(
          item.entryId
        ) ===
        Number(entryId)
    );


  let message = '';

  if (
    action ===
    'paid'
  ) {
    message =
      value
        ? `Mark ${manager?.team} as PAID?`
        : `Mark ${manager?.team} as NOT PAID?`;
  }


  if (
    action ===
    'winner'
  ) {
    message =
      value
        ? `Make ${manager?.team} the GW${gameweek} winner?\n\nThis will remove any existing winner.`
        : `Remove ${manager?.team} as winner?`;
  }


  if (
    !confirm(message)
  ) {
    return;
  }


  try {
    const response =
      await fetch(
        '/api/admin/payment',
        {
          method:
            'POST',

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
      await response
        .json();


    if (!response.ok) {
      throw new Error(
        result.error ||
        'Unable to update'
      );
    }


    await load();

  } catch (error) {
    alert(
      error.message
    );
  }
}


$('reloadAdmin')
  .addEventListener(
    'click',
    load
  );


load();
