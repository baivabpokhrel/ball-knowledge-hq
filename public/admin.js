const $ = (id) => document.getElementById(id);

const LEAGUE_ID = '92378';

let currentGw = 1;
let selectedGw = 1;

let managers = [];
let allPayments = [];

let originalDraft = null;
let draft = null;

let paymentSettings = {
  zelle: '',
  fee: 0
};


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


function showMessage(message, type = '') {
  const el = $('adminMessage');

  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.className = 'admin-message';

  if (type) {
    el.classList.add(type);
  }
}


function setLoadingMessage(message) {
  const list = $('adminManagerList');

  if (!list) return;

  list.innerHTML = `
    <div class="empty">
      ${escapeHtml(message)}
    </div>
  `;
}


/* =====================================================
   LOCAL PAYMENT LOOKUPS
===================================================== */

function getStoredPayment(gw, entryId) {
  return (
    allPayments.find(
      (item) =>
        Number(item.gameweek) === Number(gw) &&
        Number(item.entry_id) === Number(entryId)
    ) || null
  );
}


function winnerForGw(gw) {
  const payment = allPayments.find(
    (item) =>
      Number(item.gameweek) === Number(gw) &&
      item.winner === true
  );

  if (!payment) {
    return null;
  }

  return (
    managers.find(
      (manager) =>
        Number(manager.entryId) === Number(payment.entry_id)
    ) || null
  );
}


function paidCountForGw(gw) {
  return managers.filter(
    (manager) =>
      getStoredPayment(gw, manager.entryId)?.paid === true
  ).length;
}


/* =====================================================
   UPDATE LOCAL CACHE AFTER SAVE
===================================================== */

function replaceGwPayments(gw, rows) {
  allPayments = allPayments.filter(
    (item) =>
      Number(item.gameweek) !== Number(gw)
  );

  if (Array.isArray(rows)) {
    allPayments.push(...rows);
  }
}


/* =====================================================
   DRAFT
===================================================== */

function buildDraft(gw) {
  const paymentMap = {};

  managers.forEach((manager) => {
    const stored = getStoredPayment(
      gw,
      manager.entryId
    );

    paymentMap[manager.entryId] = {
      paid: stored?.paid === true,
      paidAt: stored?.paid_at || null
    };
  });

  const winner = winnerForGw(gw);

  return {
    gameweek: gw,

    winnerEntryId:
      winner
        ? Number(winner.entryId)
        : null,

    payments: paymentMap
  };
}


function cloneDraft(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


/* =====================================================
   GAMEWEEK SELECT
===================================================== */

function buildGameweekSelect() {
  const select = $('gameweekSelect');

  if (!select) return;

  select.innerHTML = '';

  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {
    const option =
      document.createElement('option');

    option.value = String(gw);

    option.textContent =
      gw === currentGw
        ? `GW ${gw} — Current`
        : `GW ${gw}`;

    select.appendChild(option);
  }

  select.value =
    String(selectedGw);
}


/* =====================================================
   WINNER SELECT
===================================================== */

function buildWinnerSelect() {
  const select = $('winnerSelect');

  if (!select || !draft) {
    return;
  }

  select.innerHTML = `
    <option value="">
      No winner selected
    </option>
  `;

  [...managers]
    .sort((a, b) =>
      String(a.team).localeCompare(
        String(b.team)
      )
    )
    .forEach((manager) => {
      const option =
        document.createElement('option');

      option.value =
        String(manager.entryId);

      option.textContent =
        `${manager.team} — ${manager.manager}`;

      select.appendChild(option);
    });

  select.value =
    draft.winnerEntryId
      ? String(draft.winnerEntryId)
      : '';
}


/* =====================================================
   RENDER EDITOR
===================================================== */

function renderEditor() {
  if (!draft) {
    return;
  }

  if ($('editingGw')) {
    $('editingGw').textContent =
      selectedGw;
  }

  buildWinnerSelect();

  const paidCount =
    managers.filter(
      (manager) =>
        draft.payments[
          manager.entryId
        ]?.paid === true
    ).length;

  if ($('draftPaidCount')) {
    $('draftPaidCount').textContent =
      `${paidCount}/${managers.length}`;
  }


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

        if (aPaid !== bPaid) {
          return aPaid ? 1 : -1;
        }

        return String(a.team)
          .localeCompare(
            String(b.team)
          );
      }
    );


  if (!$('adminManagerList')) {
    return;
  }


  $('adminManagerList').innerHTML =
    sorted.length
      ? sorted
          .map((manager) => {
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
                      ? `
                        <span class="winner-chip">
                          🏆 WINNER
                        </span>
                      `
                      : paid
                        ? `
                          <span class="paid-chip">
                            PAID
                          </span>
                        `
                        : `
                          <span class="unpaid-chip">
                            NOT PAID
                          </span>
                        `
                  }

                </div>

              </label>
            `;
          })
          .join('')
      : `
        <div class="empty">
          No managers returned by FPL.
        </div>
      `;


  document
    .querySelectorAll('.draft-paid')
    .forEach((checkbox) => {

      checkbox.addEventListener(
        'change',
        () => {

          const entryId =
            Number(
              checkbox.dataset.entry
            );

          if (
            !draft.payments[entryId]
          ) {
            draft.payments[entryId] = {
              paid: false,
              paidAt: null
            };
          }

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
    });
}


/* =====================================================
   HISTORY
===================================================== */

function renderHistory() {
  const container =
    $('adminGwHistory');

  if (!container) return;

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
      Math.max(
        0,
        total - paid
      );

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
                : 'No winner selected'
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


  container.innerHTML =
    rows.join('');


  document
    .querySelectorAll(
      '[data-history-gw]'
    )
    .forEach((button) => {

      button.addEventListener(
        'click',
        () => {

          selectedGw =
            Number(
              button.dataset
                .historyGw
            );

          if ($('gameweekSelect')) {
            $('gameweekSelect').value =
              String(selectedGw);
          }

          loadDraft();

          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
      );
    });
}


/* =====================================================
   LOAD DRAFT
===================================================== */

function loadDraft() {
  draft =
    buildDraft(selectedGw);

  originalDraft =
    cloneDraft(draft);

  renderEditor();

  showMessage('');
}


/* =====================================================
   LOAD FPL MANAGERS
===================================================== */

async function loadManagers() {
  setLoadingMessage(
    'Connecting to FPL…'
  );

  showMessage(
    'Loading FPL managers…'
  );

  const url =
    `/api/dashboard?leagueId=${LEAGUE_ID}&_=${Date.now()}`;

  console.log(
    'Loading dashboard:',
    url
  );

  const response =
    await fetch(url, {
      cache: 'no-store'
    });


  let dashboard;

  try {
    dashboard =
      await response.json();
  } catch {
    throw new Error(
      'Dashboard returned invalid JSON'
    );
  }


  console.log(
    'Dashboard response:',
    dashboard
  );


  if (!response.ok) {
    throw new Error(
      dashboard.error ||
      `Dashboard error ${response.status}`
    );
  }


  if (
    !Array.isArray(
      dashboard.managers
    )
  ) {
    throw new Error(
      'Dashboard connected, but managers array is missing.'
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
    dashboard.managers;


  if ($('adminSubtitle')) {
    $('adminSubtitle').textContent =
      `Current FPL Gameweek • GW ${currentGw} • ${managers.length} managers`;
  }


  /*
    IMPORTANT:
    Show managers immediately.

    This proves FPL worked even before
    Supabase finishes loading.
  */

  draft =
    buildDraft(currentGw);

  originalDraft =
    cloneDraft(draft);

  renderEditor();


  showMessage(
    `${managers.length} managers loaded. Loading payments…`
  );
}


/* =====================================================
   LOAD PAYMENTS / SETTINGS
===================================================== */

async function loadAllPayments() {
  const url =
    `/api/payments?from=1&to=${currentGw}&_=${Date.now()}`;


  console.log(
    'Loading payments:',
    url
  );


  const response =
    await fetch(url, {
      cache: 'no-store'
    });


  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      'Payments API returned invalid JSON'
    );
  }


  console.log(
    'Payments response:',
    data
  );


  if (!response.ok) {
    throw new Error(
      data.error ||
      `Payments API error ${response.status}`
    );
  }


  allPayments =
    Array.isArray(
      data.payments
    )
      ? data.payments
      : [];


  paymentSettings = {
    zelle:
      data.zelle || '',

    fee:
      Number(
        data.fee || 0
      )
  };


  if ($('zelleInput')) {
    $('zelleInput').value =
      paymentSettings.zelle;
  }


  if ($('feeInput')) {
    $('feeInput').value =
      paymentSettings.fee;
  }
}


/* =====================================================
   SAVE GW
===================================================== */

async function saveDraft() {
  const password =
    $('password')
      ?.value
      ?.trim() ||
    '';


  if (!password) {
    $('password')?.focus();

    showMessage(
      'Enter your admin password.',
      'error'
    );

    return;
  }


  if (!draft) {
    showMessage(
      'Nothing loaded to save.',
      'error'
    );

    return;
  }


  const button =
    $('saveChanges');


  if (button) {
    button.disabled = true;
    button.textContent =
      'Saving…';
  }


  try {
    const payloadPayments =
      managers.map(
        (manager) => ({
          entryId:
            Number(
              manager.entryId
            ),

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


    console.log(
      'Saving GW payload:',
      {
        gameweek:
          selectedGw,

        winnerEntryId:
          draft.winnerEntryId,

        payments:
          payloadPayments
      }
    );


    const response =
      await fetch(
        '/api/admin/save-payments',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          cache: 'no-store',

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


    console.log(
      'Save response:',
      result
    );


    if (!response.ok) {
      throw new Error(
        result.error ||
        'Unable to save'
      );
    }


    if (
      result.verified !== true
    ) {
      throw new Error(
        'Database save could not be verified.'
      );
    }


    /*
      Take the records that came directly
      back from Supabase.
    */

    replaceGwPayments(
      selectedGw,
      result.payments
    );


    /*
      Build screen from verified DB data.
    */

    draft =
      buildDraft(
        selectedGw
      );


    originalDraft =
      cloneDraft(draft);


    renderEditor();

    renderHistory();


    showMessage(
      `GW${selectedGw} saved & verified ✓`,
      'success'
    );


  } catch (error) {

    console.error(
      'Save failed:',
      error
    );


    showMessage(
      error.message,
      'error'
    );


  } finally {

    if (button) {
      button.disabled =
        false;

      button.textContent =
        'Save Changes';
    }
  }
}


/* =====================================================
   UNDO DRAFT
===================================================== */

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


/* =====================================================
   SAVE PAYMENT SETTINGS
===================================================== */

async function saveSettings() {
  const password =
    $('password')
      ?.value
      ?.trim() ||
    '';


  if (!password) {
    $('password')?.focus();

    showMessage(
      'Enter your admin password.',
      'error'
    );

    return;
  }


  const zelle =
    $('zelleInput')
      ?.value
      ?.trim() ||
    '';


  const fee =
    Number(
      $('feeInput')
        ?.value ||
      0
    );


  const button =
    $('saveSettings');


  if (button) {
    button.disabled = true;
    button.textContent =
      'Saving…';
  }


  try {
    const response =
      await fetch(
        '/api/admin/settings',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          cache: 'no-store',

          body:
            JSON.stringify({
              password,
              zelle,
              fee
            })
        }
      );


    const result =
      await response.json();


    if (!response.ok) {
      throw new Error(
        result.error ||
        'Unable to save settings'
      );
    }


    paymentSettings =
      result.settings;


    if ($('zelleInput')) {
      $('zelleInput').value =
        result.settings.zelle;
    }


    if ($('feeInput')) {
      $('feeInput').value =
        result.settings.fee;
    }


    showMessage(
      'Payment settings saved ✓',
      'success'
    );


  } catch (error) {

    console.error(
      error
    );


    showMessage(
      error.message,
      'error'
    );


  } finally {

    if (button) {
      button.disabled =
        false;

      button.textContent =
        'Save Payment Settings';
    }
  }
}


/* =====================================================
   BIND STATIC CONTROLS SAFELY
===================================================== */

function bindControls() {
  const winnerSelect =
    $('winnerSelect');


  if (winnerSelect) {
    winnerSelect.addEventListener(
      'change',
      (event) => {

        if (!draft) return;


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
  }


  const gameweekSelect =
    $('gameweekSelect');


  if (gameweekSelect) {
    gameweekSelect.addEventListener(
      'change',
      (event) => {

        selectedGw =
          Number(
            event.target.value
          );


        loadDraft();
      }
    );
  }


  const saveChanges =
    $('saveChanges');


  if (saveChanges) {
    saveChanges.addEventListener(
      'click',
      saveDraft
    );
  }


  const resetChanges =
    $('resetChanges');


  if (resetChanges) {
    resetChanges.addEventListener(
      'click',
      resetDraft
    );
  }


  const saveSettingsButton =
    $('saveSettings');


  if (saveSettingsButton) {
    saveSettingsButton.addEventListener(
      'click',
      saveSettings
    );
  }
}


/* =====================================================
   INIT
===================================================== */

async function init() {
  try {
    console.log(
      'Admin initialization started'
    );


    setLoadingMessage(
      'Loading FPL managers…'
    );


    /*
      STEP 1:
      FPL first.
    */

    await loadManagers();


    /*
      If we got here, FPL definitely works.
    */

    buildGameweekSelect();


    /*
      STEP 2:
      Supabase.
    */

    setLoadingMessage(
      'Managers loaded. Loading payment records…'
    );


    await loadAllPayments();


    /*
      STEP 3:
      Now build actual editor.
    */

    loadDraft();

    renderHistory();


    if ($('lastUpdated')) {
      $('lastUpdated').textContent =
        `Loaded ${new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })}`;
    }


    showMessage(
      'Admin loaded ✓',
      'success'
    );


    console.log(
      'Admin initialization completed'
    );


  } catch (error) {

    console.error(
      'ADMIN INIT ERROR:',
      error
    );


    setLoadingMessage(
      `Error: ${error.message}`
    );


    showMessage(
      error.message,
      'error'
    );
  }
}


/*
  Wait until the whole HTML page exists.
*/

document.addEventListener(
  'DOMContentLoaded',
  () => {

    bindControls();

    init();

  }
);
