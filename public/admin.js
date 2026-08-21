const $ = (id) =>
  document.getElementById(id);

const LEAGUE_ID =
  '92378';

const GW_ENTRY_FEE =
  20;


let currentGw =
  1;

let selectedGw =
  1;

let managers =
  [];

let allPayments =
  [];

let allGwSettings =
  [];

let draft =
  null;

let originalDraft =
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


function showMessage(
  message,
  type = ''
) {

  const element =
    $('adminMessage');


  if (!element) {
    return;
  }


  element.textContent =
    message;


  element.className =
    'admin-message';


  if (type) {
    element.classList.add(
      type
    );
  }
}


function setLoadingMessage(
  message
) {

  const list =
    $('adminManagerList');


  if (!list) {
    return;
  }


  list.innerHTML = `
    <div class="empty">
      ${escapeHtml(message)}
    </div>
  `;
}


/* =====================================================
   DATABASE LOOKUPS
===================================================== */

function getStoredPayment(
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


function getGwSetting(gw) {

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


function getZelleForGw(gw) {

  return (
    getGwSetting(gw)
      ?.zelle_display ||
    ''
  );
}


function winnersForGw(gw) {

  const payingRows =
    allPayments.filter(
      item =>
        Number(
          item.gameweek
        ) ===
          Number(gw) &&
        item.winner ===
          true
    );


  return payingRows
    .map(
      payment =>
        managers.find(
          manager =>
            Number(
              manager.entryId
            ) ===
            Number(
              payment.entry_id
            )
        )
    )
    .filter(Boolean);
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


/* =====================================================
   LOCAL CACHE UPDATE AFTER SAVE
===================================================== */

function replaceGwPayments(
  gw,
  rows
) {

  allPayments =
    allPayments.filter(
      item =>
        Number(
          item.gameweek
        ) !==
        Number(gw)
    );


  if (
    Array.isArray(rows)
  ) {
    allPayments.push(
      ...rows
    );
  }
}


function replaceGwSetting(
  setting
) {

  if (!setting) {
    return;
  }


  const gw =
    Number(
      setting.gameweek
    );


  allGwSettings =
    allGwSettings.filter(
      item =>
        Number(
          item.gameweek
        ) !==
        gw
    );


  allGwSettings.push(
    setting
  );
}


/* =====================================================
   DRAFT
===================================================== */

function buildDraft(gw) {

  const paymentMap =
    {};


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
          stored?.paid ===
          true,

        paidAt:
          stored?.paid_at ||
          null

      };
    }
  );


  const winners =
    winnersForGw(gw);


  return {

    gameweek:
      gw,

    zelle:
      getZelleForGw(
        gw
      ),

    winnerEntryIds:
      new Set(
        winners.map(
          winner =>
            Number(
              winner.entryId
            )
        )
      ),

    payments:
      paymentMap

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

  const select =
    $('gameweekSelect');


  if (!select) {
    return;
  }


  select.innerHTML =
    '';


  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {

    const option =
      document.createElement(
        'option'
      );


    option.value =
      String(gw);


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


/* =====================================================
   RENDER EDITOR
===================================================== */

function renderEditor() {

  if (!draft) {
    return;
  }


  if ($('editingGw')) {

    $('editingGw')
      .textContent =
        selectedGw;

  }


  if ($('zelleGwLabel')) {

    $('zelleGwLabel')
      .textContent =
        selectedGw;

  }


  if ($('zelleInput')) {

    $('zelleInput')
      .value =
        draft.zelle ||
        '';

  }


  const paidCount =
    managers.filter(
      manager =>
        draft.payments[
          manager.entryId
        ]?.paid === true
    ).length;


  if ($('draftPaidCount')) {

    $('draftPaidCount')
      .textContent =
        `${paidCount}/${managers.length}`;

  }


  const sorted =
    [...managers]
      .sort(
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


  if (!$('adminManagerList')) {
    return;
  }


  $('adminManagerList')
    .innerHTML =
      sorted.map(
        manager => {

          const paid =
            draft.payments[
              manager.entryId
            ]?.paid === true;


          const isWinner =
            draft.winnerEntryIds.has(
              Number(
                manager.entryId
              )
            );


          return `
            <div
              class="
                admin-manager-row
                ${paid ? 'paid-row' : ''}
                ${isWinner ? 'winner-row' : ''}
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
                  ${escapeHtml(manager.manager)}
                </strong>

                <small>
                  ${escapeHtml(manager.team)}
                </small>

              </div>


              <button
                type="button"
                class="winner-toggle ${isWinner ? 'active' : ''}"
                data-winner-entry="${manager.entryId}"
                aria-label="Toggle Gameweek winner"
                title="Mark/unmark as a GW winner (ties allowed)"
              >
                🏆
              </button>


              <div class="admin-row-state">

                ${
                  isWinner
                    ? `
                      <span class="winner-chip">
                        WINNER
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

            </div>
          `;
        }
      )
      .join('');


  /*
    Checkbox and winner-toggle changes are LOCAL ONLY
    until "Save GW" is pressed.
  */

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


            /*
              Preserve manually typed Zelle
              before rerendering.
            */

            if ($('zelleInput')) {

              draft.zelle =
                $('zelleInput')
                  .value;

            }


            renderEditor();


            showMessage(
              'Unsaved changes',
              'warning'
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      '.winner-toggle'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            const entryId =
              Number(
                button.dataset
                  .winnerEntry
              );


            if (
              draft.winnerEntryIds.has(
                entryId
              )
            ) {

              draft.winnerEntryIds.delete(
                entryId
              );

            } else {

              draft.winnerEntryIds.add(
                entryId
              );

            }


            if ($('zelleInput')) {

              draft.zelle =
                $('zelleInput')
                  .value;

            }


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


/* =====================================================
   HISTORY
===================================================== */

function renderHistory() {

  const container =
    $('adminGwHistory');


  if (!container) {
    return;
  }


  const rows =
    [];


  for (
    let gw = currentGw;
    gw >= 1;
    gw--
  ) {

    const paid =
      paidCountForGw(
        gw
      );


    const total =
      managers.length;


    const remaining =
      Math.max(
        0,
        total - paid
      );


    const winners =
      winnersForGw(
        gw
      );


    const zelle =
      getZelleForGw(
        gw
      );


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
              winners.length
                ? `🏆 ${winners.map(w => escapeHtml(w.manager)).join(', ')}`
                : 'No winner selected'
            }
          </small>

          <small>
            ${
              zelle
                ? `Zelle: ${escapeHtml(zelle)}`
                : 'Zelle not entered'
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


            if ($('gameweekSelect')) {

              $('gameweekSelect')
                .value =
                  String(
                    selectedGw
                  );

            }


            loadDraft();


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
}


/* =====================================================
   LOAD DRAFT
===================================================== */

function loadDraft() {

  draft =
    buildDraft(
      selectedGw
    );


  originalDraft =
    cloneDraft(
      draft
    );


  renderEditor();


  showMessage('');
}


/* =====================================================
   SAVE CURRENT GW
===================================================== */

async function saveDraft() {

  const password =
    $('password')
      ?.value
      ?.trim() ||
    '';


  if (!password) {

    $('password')
      ?.focus();


    showMessage(
      'Enter your admin password.',
      'error'
    );


    return;
  }


  /*
    Grab current Zelle input before saving.
  */

  draft.zelle =
    $('zelleInput')
      ?.value
      ?.trim() ||
    '';


  const button =
    $('saveChanges');


  if (button) {

    button.disabled =
      true;


    button.textContent =
      `Saving GW${selectedGw}…`;

  }


  try {

    const payloadPayments =
      managers.map(
        manager => ({

          entryId:
            Number(
              manager.entryId
            ),

          paid:
            draft.payments[
              manager.entryId
            ]?.paid ===
            true,

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

          cache:
            'no-store',

          body:
            JSON.stringify({

              password,

              gameweek:
                selectedGw,

              zelle:
                draft.zelle,

              winnerEntryIds:
                [...draft.winnerEntryIds],

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
        'Unable to save Gameweek'
      );

    }


    if (
      result.verified !==
      true
    ) {

      throw new Error(
        'Database save could not be verified.'
      );

    }


    /*
      Update payment cache from VERIFIED DB response.
    */

    replaceGwPayments(
      selectedGw,
      result.payments
    );


    /*
      Update Zelle cache from VERIFIED DB response.
    */

    replaceGwSetting(
      result.gameweekSetting
    );


    /*
      Rebuild from DB response.
    */

    draft =
      buildDraft(
        selectedGw
      );


    originalDraft =
      cloneDraft(
        draft
      );


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
        'Save GW';

    }
  }
}


/* =====================================================
   UNDO UNSAVED CHANGES
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
   LOAD FPL
===================================================== */

async function loadManagers() {

  setLoadingMessage(
    'Loading FPL managers…'
  );


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
      'Unable to load FPL league'
    );

  }


  if (
    !Array.isArray(
      dashboard.managers
    )
  ) {

    throw new Error(
      'Managers array missing from dashboard'
    );

  }


  currentGw =
    Number(
      dashboard.gameweek
        ?.id ||
      1
    );


  selectedGw =
    currentGw;


  managers =
    dashboard.managers;


  if ($('adminSubtitle')) {

    $('adminSubtitle')
      .textContent =
        `Current FPL Gameweek • GW ${currentGw} • ${managers.length} managers`;

  }
}


/* =====================================================
   LOAD PAYMENT HISTORY
===================================================== */

async function loadAllPayments() {

  const response =
    await fetch(
      `/api/payments?from=1&to=${currentGw}&_=${Date.now()}`,
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


  allGwSettings =
    Array.isArray(
      data.gameweekSettings
    )
      ? data.gameweekSettings
      : [];
}


/* =====================================================
   STATIC CONTROLS
===================================================== */

function bindControls() {

  /*
    Winner selection now happens per-manager via the
    trophy toggle button in each row (see renderEditor),
    which supports marking more than one manager as a
    winner for a Gameweek that ended in a tie.
  */

  /*
    ZELLE
  */

  $('zelleInput')
    ?.addEventListener(
      'input',
      event => {

        if (!draft) {
          return;
        }


        draft.zelle =
          event.target.value;


        showMessage(
          'Unsaved changes',
          'warning'
        );
      }
    );


  /*
    GAMEWEEK
  */

  $('gameweekSelect')
    ?.addEventListener(
      'change',
      event => {

        selectedGw =
          Number(
            event.target.value
          );


        loadDraft();
      }
    );


  /*
    SAVE
  */

  $('saveChanges')
    ?.addEventListener(
      'click',
      saveDraft
    );


  /*
    UNDO
  */

  $('resetChanges')
    ?.addEventListener(
      'click',
      resetDraft
    );
}


/* =====================================================
   INIT
===================================================== */

async function init() {

  try {

    if ($('lastUpdated')) {

      $('lastUpdated')
        .textContent =
          'Loading…';

    }


    await loadManagers();


    buildGameweekSelect();


    setLoadingMessage(
      'Managers loaded. Loading payment records…'
    );


    await loadAllPayments();


    loadDraft();

    renderHistory();


    if ($('lastUpdated')) {

      $('lastUpdated')
        .textContent =
          `Loaded ${new Date().toLocaleTimeString([], {
            hour:
              'numeric',

            minute:
              '2-digit'
          })}`;

    }


    showMessage(
      'Admin loaded ✓',
      'success'
    );


  } catch (error) {

    console.error(
      'Admin load error:',
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


document.addEventListener(
  'DOMContentLoaded',
  () => {

    bindControls();

    init();

  }
);
