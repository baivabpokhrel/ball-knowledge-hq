const $ = (id) =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

let gameweek = 1;

let managers = [];

let payments = [];


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function isPaid(entryId) {
  const payment =
    payments.find(
      (item) =>
        Number(
          item.entry_id
        ) ===
        Number(entryId)
    );

  return (
    payment?.paid === true
  );
}


function render() {
  $('adminGw')
    .textContent =
      gameweek;

  const paidCount =
    managers.filter(
      (manager) =>
        isPaid(
          manager.entryId
        )
    ).length;

  const total =
    managers.length;

  $('adminTotals')
    .innerHTML =
      `
        <strong style="font-size:24px;">
          ${paidCount} / ${total}
        </strong>

        <span style="color:#9097a1;">
          paid
        </span>
      `;

  const sorted =
    [...managers].sort(
      (a, b) => {
        const aPaid =
          isPaid(a.entryId);

        const bPaid =
          isPaid(b.entryId);

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
          String(b.team)
        );
      }
    );

  $('adminList').innerHTML =
    sorted
      .map(
        (manager) => {
          const paid =
            isPaid(
              manager.entryId
            );

          return `
            <button
              type="button"
              class="payment-row ${paid ? 'is-paid' : 'is-unpaid'} admin-payment-button"
              data-entry="${manager.entryId}"
              data-paid="${paid}"
              style="
                width:100%;
                color:inherit;
                text-align:left;
                cursor:pointer;
              "
            >

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

              </div>

              <div class="payment-label">
                ${
                  paid
                    ? 'PAID'
                    : 'MARK PAID'
                }
              </div>

            </button>
          `;
        }
      )
      .join('');

  document
    .querySelectorAll(
      '.admin-payment-button'
    )
    .forEach(
      (button) => {
        button.addEventListener(
          'click',
          () => {
            updatePayment(
              Number(
                button.dataset
                  .entry
              ),

              button.dataset
                .paid !==
                'true'
            );
          }
        );
      }
    );
}


async function load() {
  $('adminList')
    .innerHTML =
      `
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
      dashboard.gameweek?.id ||
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
    console.error(error);

    $('adminList')
      .innerHTML =
        `
          <div class="empty">
            ${escapeHtml(error.message)}
          </div>
        `;
  }
}


async function updatePayment(
  entryId,
  paid
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
      (item) =>
        Number(
          item.entryId
        ) ===
        Number(entryId)
    );

  const action =
    paid
      ? 'mark as PAID'
      : 'mark as NOT PAID';

  const confirmed =
    confirm(
      `${manager?.team || 'Manager'}\n\n${action}?`
    );

  if (!confirmed) {
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
              paid
            })
        }
      );

    const result =
      await response
        .json();

    if (!response.ok) {
      throw new Error(
        result.error ||
        'Unable to update payment'
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
