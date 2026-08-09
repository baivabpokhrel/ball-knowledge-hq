const $ = (id) => document.getElementById(id);

const DEFAULT_LEAGUE_ID = '92378';
let leagueId = DEFAULT_LEAGUE_ID;

function row(m, i, weekly) {
  const move =
    m.movement > 0
      ? `<span class="up">▲ ${m.movement}</span>`
      : m.movement < 0
        ? `<span class="down">▼ ${Math.abs(m.movement)}</span>`
        : '—';

  return `
    <div class="row">
      <div class="rank">${i + 1}</div>

      <div class="person">
        <b>${m.team}</b>
        <small>${m.manager}</small>
      </div>

      <div class="score">
        <b>${weekly ? m.gameweekPoints : m.seasonPoints}</b>
        <small>${weekly ? 'GW pts' : move}</small>
      </div>
    </div>
  `;
}

function render(d) {
  if ($('setup')) $('setup').hidden = true;
  if ($('dashboard')) $('dashboard').hidden = false;

  if ($('league')) {
    $('league').textContent =
      d.league?.name || 'Ball Knowledge Only';
  }

  if ($('updated')) {
    $('updated').textContent =
      `Updated ${new Date(d.updatedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })}`;
  }

  if ($('gw')) {
    $('gw').textContent = d.gameweek?.id ?? '—';
  }

  const weekly = Array.isArray(d.weekly)
    ? d.weekly
    : [];

  const overall = Array.isArray(d.overall)
    ? d.overall
    : [];

  const leader = weekly[0];

  if ($('weeklyLeader')) {
    $('weeklyLeader').textContent =
      leader?.manager || '—';
  }

  if ($('weeklyPoints')) {
    $('weeklyPoints').textContent =
      leader?.gameweekPoints ?? '—';
  }

  if ($('statusCode')) {
    $('statusCode').textContent =
      d.gameweek?.status?.code || '—';
  }

  if ($('statusText')) {
    $('statusText').textContent =
      d.gameweek?.status?.label || '';
  }

  if ($('weeklyList')) {
    $('weeklyList').innerHTML =
      weekly
        .map((m, i) => row(m, i, true))
        .join('');
  }

  if ($('overallList')) {
    $('overallList').innerHTML =
      overall
        .map((m, i) => row(m, i, false))
        .join('');
  }

  const awards = d.awards || {};

  const isFinal =
    Boolean(d.gameweek?.status?.final);

  if (isFinal) {
    const winners =
      Array.isArray(awards.winners)
        ? awards.winners
        : [];

    if ($('awardTitle')) {
      $('awardTitle').textContent =
        winners.length > 1
          ? 'Gameweek Winners'
          : 'Manager of the Week';
    }

    if ($('awardText')) {
      $('awardText').textContent =
        winners.length > 0
          ? winners
              .map(
                (x) =>
                  `${x.manager} — ${x.gameweekPoints} pts`
              )
              .join(', ')
          : '—';
    }

    if ($('awardNote')) {
      $('awardNote').textContent =
        'Official result after FPL bonuses and corrections.';
    }
  } else {
    const provisional =
      Array.isArray(awards.provisionalLeader)
        ? awards.provisionalLeader
        : leader
          ? [leader]
          : [];

    if ($('awardTitle')) {
      $('awardTitle').textContent =
        'Provisional Leader';
    }

    if ($('awardText')) {
      $('awardText').textContent =
        provisional.length > 0
          ? provisional
              .map(
                (x) =>
                  `${x.manager} — ${x.gameweekPoints} pts`
              )
              .join(', ')
          : '—';
    }

    if ($('awardNote')) {
      $('awardNote').textContent =
        'Not official yet. Waiting for FPL bonus points and final checks.';
    }
  }
}

async function loadDashboard() {
  if ($('updated')) {
    $('updated').textContent = 'Updating…';
  }

  try {
    const response = await fetch(
      `/api/dashboard?leagueId=${encodeURIComponent(
        leagueId
      )}`,
      {
        cache: 'no-store'
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          `Unable to load FPL data (${response.status})`
      );
    }

    render(data);
  } catch (error) {
    console.error(
      'FPL dashboard error:',
      error
    );

    if ($('updated')) {
      $('updated').textContent =
        error.message ||
        'Unable to load FPL data';
    }

    if ($('setup')) {
      $('setup').hidden = false;
    }
  }
}

/*
  Optional manual league connection.
  This still works if your HTML
  contains #connect and #leagueId.
*/
if ($('connect')) {
  $('connect').addEventListener(
    'click',
    () => {
      const input = $('leagueId');

      if (
        input &&
        input.value.trim()
      ) {
        leagueId =
          input.value.trim();
      }

      loadDashboard();
    }
  );
}

/*
  Refresh always fetches
  real FPL data.
*/
if ($('refresh')) {
  $('refresh').addEventListener(
    'click',
    loadDashboard
  );
}

/*
  Tab navigation.
*/
document
  .querySelectorAll('[data-tab]')
  .forEach((button) => {
    button.addEventListener(
      'click',
      () => {
        document
          .querySelectorAll('[data-tab]')
          .forEach((item) => {
            item.classList.toggle(
              'active',
              item === button
            );
          });

        document
          .querySelectorAll('.panel')
          .forEach((panel) => {
            panel.hidden =
              panel.id !==
              button.dataset.tab;
          });
      }
    );
  });

/*
  Automatically load
  real league 92378.
*/
loadDashboard();
