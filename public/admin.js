const $ = id =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

let currentGw = 1;

let selectedGw = 1;

let managers = [];

let allPayments = [];

let originalDraft = null;

let draft = null;


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


function showMessage(
  message,
  type = ''
) {
  const el =
    $('adminMessage');

  el.textContent =
    message;

  el.className =
    'admin-message';

  if (type) {
    el.classList.add(type);
  }
}


function getStoredPayment(
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


function paidCountForGw(gw) {
  return managers.filter(
    manager =>
      getStoredPayment(
        gw,
        manager.entryId
      )?.paid === true
  ).length;
}


function winnerForGw(gw) {
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
    managers.find(
      manager =>
        Number(manager.entryId) ===
        Number(row.entry_id)
    ) || null
  );
}


/*
  ====================================
  CREATE LOCAL DRAFT
  ====================================
*/

function buildDraft(gw) {
  const paymentMap = {};

  managers.forEach(
    manager => {
      const stored =
        getStoredPayment(
          gw,
          manager.entryId
        );

      paymentMap[
        manager.entryId
      ] = {
        paid:
          stored?.paid === true,

        paidAt:
          stored?.paid_at || null
      };
    }
  );

  const winner =
    winnerForGw(gw);

  return {
    gameweek: gw,

    winnerEntryId:
      winner
        ? Number(
            winner.entryId
          )
        : null,

    payments:
      paymentMap
  };
}


function cloneDraft(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


/*
  ====================================
  GW SELECT
  ====================================
*/

function buildGameweekSelect() {
  const select =
    $('gameweekSelect');

  select.innerHTML = '';

  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {
    const option =
      document.createElement(
        'option'
      );

    option.value = gw;

    option.textContent =
      gw === currentGw
        ? `GW ${gw} — Current`
        : `GW ${gw}`;

    select.appendChild(
      option
    );
  }

  select.value =
    String(selectedGw);
}


/*
  ====================================
  WINNER SELECT
  ====================================
*/

function buildWinnerSelect() {
  const select =
    $('winnerSelect');

  select.innerHTML = `
    <option value="">
      No winner selected
    </option>
  `;

  managers
    .slice()
    .sort(
      (a, b) =>
        String(a.team)
          .localeCompare(
            String(b.team)
          )
    )
    .forEach(
      manager => {
        const option =
          document.createElement(
            'option'
          );

        option.value =
          manager.entryId;

        option.textContent =
          `${manager.team} — ${manager.manager}`;

        select.appendChild(
          option
        );
      }
    );

  select.value =
    draft?.winnerEntryId
      ? String(
          draft.winnerEntryId
        )
      : '';
}


/*
  ====================================
  RENDER EDITOR
  ====================================
*/

function renderEditor() {
  if (!draft) {
    return;
  }

  $('editingGw')
    .textContent =
      selectedGw;

  buildWinnerSelect();

  const paidCount =
    managers.filter(
      manager =>
        draft.payments[
          manager.entryId
        ]?.paid === true
    ).length;

  $('draftPaidCount')
    .textContent =
      `${paidCount}/${managers.length}`;


  const sorted =
    [...managers].sort(
      (a, b) => {

        const aPaid =
          draft.payments[
            a.entryId
          ]?.paid === true;

        const bPaid =
          draft.payments[
            b.entryId
          ]?.paid === true;

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
    );


  $('adminManagerList')
    .innerHTML =
      sorted.map(
        manager => {

          const paid =
            draft.payments[
              manager.entryId
            ]?.paid === true;

          const winner =
            Number(
              draft.winnerEntryId
            ) ===
            Number(
              manager.entryId
            );

          return `
            <label
              class="
                admin-manager-row
                ${paid ? 'paid-row' : ''}
                ${winner ? 'winner-row' : ''}
              "
            >

              <input
                type="checkbox"

                class="draft-paid"

                data-entry="${manager.entryId}"

                ${paid ? 'checked' : ''}
              >

              <div class="manager-info">

                <strong>
                  ${escapeHtml(manager.team)}
                </strong>

                <small>
                  ${escapeHtml(manager.manager)}
                </small>

              </div>

              <div class="admin-row-state">

                ${
                  winner
                    ? `<span class="winner-chip">🏆 WINNER</span>`
                    : paid
                      ? `<span class="paid-chip">PAID</span>`
                      : `<span class="unpaid-chip">NOT PAID</span>`
                }

              </div>

            </label>
          `;
        }
      )
      .join('');


  document
    .querySelectorAll(
      '.draft-paid'
    )
    .forEach(
      checkbox => {

        checkbox.addEventListener(
          'change',
          () => {

            const entryId =
              Number(
                checkbox.dataset
                  .entry
              );

            draft.payments[
              entryId
            ].paid =
              checkbox.checked;

            renderEditor();

            showMessage(
              'Unsaved changes',
              'warning'
            );
          }
        );
      }
    );
}


/*
  ====================================
  ALL GW HISTORY
  ====================================
*/

function renderHistory() {
  const rows = [];

  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {
    const paid =
      paidCountForGw(gw);

    const total =
      managers.length;

    const remaining =
      total - paid;

    const winner =
      winnerForGw(gw);

    rows.push(`
      <button
        type="button"

        class="history-gw-row"

        data-history-gw="${gw}"
      >

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
                : 'No winner yet'
            }
          </small>

        </div>


        <div class="history-status">

          <strong>
            ${paid}/${total}
          </strong>

          <small>
            ${
              remaining === 0
                ? 'ALL PAID'
                : `${remaining} LEFT`
            }
          </small>

        </div>

      </button>
    `);
  }


  $('adminGwHistory')
    .innerHTML =
      rows.join('');


  document
    .querySelectorAll(
      '[data-history-gw]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            selectedGw =
              Number(
                button.dataset
                  .historyGw
              );

            $('gameweekSelect')
              .value =
                selectedGw;

            loadDraft();

            window.scrollTo({
              top: 0,
              behavior:
                'smooth'
            });
          }
        );
      }
    );
}


/*
  ====================================
  LOAD DRAFT
  ====================================
*/

function loadDraft() {
  draft =
    buildDraft(
      selectedGw
    );

  originalDraft =
    cloneDraft(draft);

  showMessage('');

  renderEditor();
}


/*
  ====================================
  SAVE
  ====================================
*/

async function saveDraft() {
  const password =
    $('password')
      .value
      .trim();

  if (!password) {
    $('password').focus();

    showMessage(
      'Enter your admin password.',
      'error'
    );

    return;
  }

  $('saveChanges')
    .disabled =
      true;

  $('saveChanges')
    .textContent =
      'Saving…';

  try {
    const payloadPayments =
      managers.map(
        manager => ({
          entryId:
            manager.entryId,

          paid:
            draft.payments[
              manager.entryId
            ]?.paid === true,

          paidAt:
            draft.payments[
              manager.entryId
            ]?.paidAt ||
            null
        })
      );


    const response =
      await fetch(
        '/api/admin/save-payments',
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

              gameweek:
                selectedGw,

              winnerEntryId:
                draft.winnerEntryId,

              payments:
                payloadPayments
            })
        }
      );


    const result =
      await response.json();


    if (!response.ok) {
      throw new Error(
        result.error ||
        'Unable to save'
      );
    }


    await loadAllPayments();

    draft =
      buildDraft(
        selectedGw
      );

    originalDraft =
      cloneDraft(draft);

    renderEditor();

    renderHistory();

    showMessage(
      `GW${selectedGw} saved successfully ✓`,
      'success'
    );

  } catch (error) {

    showMessage(
      error.message,
      'error'
    );

  } finally {

    $('saveChanges')
      .disabled =
        false;

    $('saveChanges')
      .textContent =
        'Save Changes';
  }
}


/*
  ====================================
  RESET / UNDO UNSAVED
  ====================================
*/

function resetDraft() {
  if (!originalDraft) {
    return;
  }

  draft =
    cloneDraft(
      originalDraft
    );

  renderEditor();

  showMessage(
    'Unsaved changes removed.'
  );
}


/*
  ====================================
  WINNER CHANGE
  ====================================
*/

$('winnerSelect')
  .addEventListener(
    'change',
    event => {

      draft.winnerEntryId =
        event.target.value
          ? Number(
              event.target.value
            )
          : null;

      renderEditor();

      showMessage(
        'Unsaved changes',
        'warning'
      );
    }
  );


/*
  ====================================
  GAMEWEEK CHANGE
  ====================================
*/

$('gameweekSelect')
  .addEventListener(
    'change',
    event => {

      selectedGw =
        Number(
          event.target.value
        );

      loadDraft();
    }
  );


$('saveChanges')
  .addEventListener(
    'click',
    saveDraft
  );


$('resetChanges')
  .addEventListener(
    'click',
    resetDraft
  );


/*
  ====================================
  API LOADERS
  ====================================
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

  selectedGw =
    currentGw;

  managers =
    Array.isArray(
      dashboard.managers
    )
      ? dashboard.managers
      : [];

  $('adminSubtitle')
    .textContent =
      `Current FPL Gameweek • GW ${currentGw}`;
}


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
  ====================================
  INIT
  ====================================
*/

async function init() {
  try {
    await loadManagers();

    await loadAllPayments();

    buildGameweekSelect();

    loadDraft();

    renderHistory();

    $('lastUpdated')
      .textContent =
        `Loaded ${new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })}`;

  } catch (error) {

    $('adminManagerList')
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
