/*
  Shared "what does this manager's Gameweek actually look like right
  now" logic - used by both api/squads.js (full per-player detail
  for the Squad tab) and api/dashboard.js (just the manager-level
  total, for the GW Standings table and every screen that reads
  manager.gameweekPoints).

  This used to live only in squads.js. dashboard.js instead trusted
  FPL's own entry/{id}/event/{gw}/picks/ entry_history.points for
  "this Gameweek's points" directly - which turns out to lag well
  behind the per-player event/{gw}/live/ feed during a live
  Gameweek (FPL only recomputes that aggregate figure periodically,
  not on every live score change). Confirmed live: opening a
  manager's Squad tab showed correct, up-to-the-minute points
  (because squads.js was already computing its own total by summing
  each player's live/ points), while that same manager's row on the
  GW Standings table - and the total shown at the top of their own
  Squad tab, both sourced from manager.gameweekPoints - sat stale
  for minutes at a time even as goals went in.

  The fix: both routes compute the SAME live total, from the SAME
  per-player live/ feed, via this one shared function - instead of
  dashboard.js trusting a slower, separate FPL figure that squads.js
  was already correctly bypassing. Once FPL has fully data-checked a
  Gameweek (event.data_checked), its own entry_history.points
  becomes the guaranteed-final word (it can reflect late stat
  corrections this live computation can't see), so callers should
  prefer that once buildLiveContext's gwDataChecked flips true -
  see dashboard.js/squads.js for exactly how each uses it.
*/

const CHIP_LABELS = {
  wildcard: 'Wildcard',
  freehit: 'Free Hit',
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
  manager: 'Assistant Manager'
};

export function chipLabel(code) {
  return CHIP_LABELS[code] || null;
}

/*
  A player is "out" for auto-substitution/captaincy-fallback
  purposes once their match has finished AND they recorded 0
  minutes that Gameweek - FPL's own trigger for both mechanisms.
  A player whose match is still LIVE is never treated as out here,
  even at 0 minutes so far, since they could still be brought on
  before full time.
*/
function isPlayerOut(player) {
  return player.status === 'final' && player.minutes === 0;
}

/*
  Real FPL auto-substitutions: if a starting-XI player records 0
  minutes once their match is finished, they're swapped out for a
  bench player in the manager's own bench-priority order, skipping
  anyone who'd break a valid formation (1 GKP; 3-5 DEF; 2-5 MID;
  1-3 FWD) or who is themselves "out". The reserve goalkeeper
  (always bench slot 12) can only ever replace the starting
  goalkeeper - never an outfield player, and no outfield bench
  player ever replaces the goalkeeper.

  Independently, if the captain is "out", the double (or, with
  Triple Captain active, triple) points move to the vice-captain -
  provided the vice-captain isn't ALSO out, in which case nobody's
  score is doubled that Gameweek. This is evaluated separately from
  the substitution logic above (a captain can lose the armband to
  the vice-captain whether or not they were also auto-subbed out of
  the XI).

  Mutates each pick's `multiplier` in place and returns what
  happened, for the UI to explain the final scores.
*/
function applyAutoSubsAndCaptaincy(picks, activeChip) {

  const autoSubs = [];
  let captainFallback = null;

  const startingXI = picks.filter(player => player.slot <= 11);
  const bench = picks
    .filter(player => player.slot > 11)
    .sort((a, b) => a.slot - b.slot);

  const benchGoalkeeper = bench[0] || null;
  const benchOutfield = bench.slice(1);

  /*
    Bench Boost already counts all 15 players (every bench spot is
    forced to multiplier 1 above), so there's nothing to substitute
    - a 0-minute bench player under Bench Boost is just a bench
    player contributing 0, exactly as FPL treats it.
  */
  if (activeChip !== 'bboost') {

    const startingGoalkeeper =
      startingXI.find(player => player.position === 'GKP');

    if (
      startingGoalkeeper &&
      isPlayerOut(startingGoalkeeper) &&
      benchGoalkeeper &&
      benchGoalkeeper.multiplier === 0 &&
      !isPlayerOut(benchGoalkeeper)
    ) {
      autoSubs.push({
        outId: startingGoalkeeper.id,
        outName: startingGoalkeeper.name,
        inId: benchGoalkeeper.id,
        inName: benchGoalkeeper.name
      });

      benchGoalkeeper.multiplier = 1;
      startingGoalkeeper.multiplier = 0;
    }

    const usedBenchIds = new Set(autoSubs.map(sub => sub.inId));

    function countingOutfieldTotals() {
      const counting = picks.filter(
        player => player.multiplier > 0 && player.position !== 'GKP'
      );

      return {
        DEF: counting.filter(player => player.position === 'DEF').length,
        MID: counting.filter(player => player.position === 'MID').length,
        FWD: counting.filter(player => player.position === 'FWD').length
      };
    }

    for (const outPlayer of startingXI.filter(player => player.position !== 'GKP')) {

      if (outPlayer.multiplier === 0 || !isPlayerOut(outPlayer)) {
        continue;
      }

      const candidate = benchOutfield.find(benchPlayer => {

        if (usedBenchIds.has(benchPlayer.id)) {
          return false;
        }
        if (benchPlayer.multiplier > 0) {
          return false;
        }
        if (isPlayerOut(benchPlayer)) {
          return false;
        }

        const counts = countingOutfieldTotals();
        counts[outPlayer.position] -= 1;
        counts[benchPlayer.position] = (counts[benchPlayer.position] || 0) + 1;

        return (
          counts.DEF >= 3 && counts.DEF <= 5 &&
          counts.MID >= 2 && counts.MID <= 5 &&
          counts.FWD >= 1 && counts.FWD <= 3
        );

      });

      if (candidate) {
        autoSubs.push({
          outId: outPlayer.id,
          outName: outPlayer.name,
          inId: candidate.id,
          inName: candidate.name
        });

        usedBenchIds.add(candidate.id);
        candidate.multiplier = 1;
        outPlayer.multiplier = 0;
      }

    }

  }

  const captain = picks.find(player => player.isCaptain);
  const viceCaptain = picks.find(player => player.isViceCaptain);
  const armbandMultiplier = activeChip === '3xc' ? 3 : 2;

  if (captain && isPlayerOut(captain)) {

    if (viceCaptain && !isPlayerOut(viceCaptain)) {

      captain.multiplier = captain.multiplier > 0 ? 1 : 0;
      viceCaptain.multiplier =
        viceCaptain.multiplier > 0 ? armbandMultiplier : viceCaptain.multiplier;

      captainFallback = {
        fromId: captain.id,
        fromName: captain.name,
        toId: viceCaptain.id,
        toName: viceCaptain.name
      };

    } else {

      // Both captain and vice-captain are out - per FPL's own
      // rules, nobody's score is doubled this Gameweek.
      captain.multiplier = captain.multiplier > 0 ? 1 : 0;

      captainFallback = {
        fromId: captain.id,
        fromName: captain.name,
        toId: null,
        toName: null
      };

    }

  }

  return { autoSubs, captainFallback };

}

/*
  Builds the shared per-Gameweek context every manager's live score
  is computed against - bootstrap lookups, the real-time live/ feed,
  and which teams have a fixture that's started/finished for this
  GW - ONCE per request, not once per manager. Also carries
  gwDataChecked: whether FPL has fully data-checked this Gameweek
  yet, which callers use to decide whether to trust FPL's own
  entry_history.points (once true) or this module's own live
  computation (until then).
*/
export function buildLiveContext(bootstrap, fixtures, live, gw) {
  const elementsById = new Map(
    (bootstrap.elements || []).map(element => [element.id, element])
  );

  const teamsById = new Map(
    (bootstrap.teams || []).map(team => [team.id, team])
  );

  const typesById = new Map(
    (bootstrap.element_types || []).map(type => [type.id, type])
  );

  /*
    event/{gw}/live/ is FPL's dedicated real-time scoring feed - it
    updates noticeably faster during a match than the mirrored
    copies of the same numbers (minutes, event_points) inside
    bootstrap-static, which is why bootstrap is only ever used below
    as a fallback for a player live/ has no entry for yet.
  */
  const liveStatsByElement = new Map(
    (live?.elements || []).map(entry => [entry.id, entry.stats || {}])
  );

  const gwEvent = (bootstrap.events || []).find(event => event.id === gw);
  const gwDataChecked = !!gwEvent?.data_checked;

  /*
    Which teams have a fixture that's already kicked off (live or
    finished) vs one still to come, for THIS GW. A team with no
    fixture data at all (blank GW) is left out of both sets and
    treated as "not started".
  */
  const startedTeamIds = new Set();
  const finishedTeamIds = new Set();

  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    if (fixture.started) {
      startedTeamIds.add(fixture.team_h);
      startedTeamIds.add(fixture.team_a);
    }
    if (fixture.finished || fixture.finished_provisional) {
      finishedTeamIds.add(fixture.team_h);
      finishedTeamIds.add(fixture.team_a);
    }
  }

  return {
    elementsById,
    teamsById,
    typesById,
    liveStatsByElement,
    startedTeamIds,
    finishedTeamIds,
    gwDataChecked
  };
}

/*
  Turns one manager's raw entry/{id}/event/{gw}/picks/ response into
  a full live squad view: each player's live/projected points,
  auto-subs and captaincy fallback applied, and the resulting
  Gameweek total - net of the transfer-cost hit - computed fresh
  from event/{gw}/live/ rather than waiting on FPL's own slower-to-
  update aggregate. `context` is a buildLiveContext(...) result.

  actualPoints is still FPL's own official per-GW figure (also net
  of the transfer-cost hit) for callers that want to show/prefer it
  once a Gameweek is fully data-checked; predictedTotal is this
  module's own always-fresh live computation.
*/
export function buildManagerSquad(picksData, context) {
  const {
    elementsById,
    teamsById,
    typesById,
    liveStatsByElement,
    startedTeamIds,
    finishedTeamIds,
    gwDataChecked
  } = context;

  const rawPicks = Array.isArray(picksData.picks) ? picksData.picks : [];

  const picks = rawPicks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(pick => {
      const element = elementsById.get(pick.element);
      const team = element ? teamsById.get(element.team) : null;
      const type = element ? typesById.get(element.element_type) : null;

      const teamId = element?.team;
      const started = teamId != null && startedTeamIds.has(teamId);
      const finished = teamId != null && finishedTeamIds.has(teamId);

      const epThis = element ? Number(element.ep_this || 0) : 0;

      const liveStats = liveStatsByElement.get(pick.element);

      const livePoints =
        liveStats?.total_points != null
          ? Number(liveStats.total_points)
          : element
            ? Number(element.event_points || 0)
            : 0;

      /*
        The blended number: real points once the player's match has
        started, FPL's own projection until then.
      */
      const pointsBasis = started ? livePoints : epThis;

      /*
        FPL's own "multiplier" is SUPPOSED to already reflect
        whatever chip is active - 0 for a normal bench spot, 1 if
        Bench Boost is on, 2 for a captain, 3 if Triple Captain is
        on - but it's not worth trusting blindly (managers have
        reported it lagging active_chip right after a chip is
        played). Force it to match what the chip actually implies
        so captain doubling and Bench Boost always show up
        correctly. This is the BASE multiplier, before auto-subs/
        captaincy fallback (applyAutoSubsAndCaptaincy) can still
        adjust it below.
      */
      let multiplier = pick.multiplier || 0;

      const isBenchSlot = pick.position > 11;

      if (
        picksData.active_chip === 'bboost' &&
        isBenchSlot &&
        multiplier === 0
      ) {
        multiplier = 1;
      }

      if (pick.is_captain) {
        multiplier = picksData.active_chip === '3xc' ? 3 : 2;
      }

      return {
        id: pick.element,
        name: element?.web_name || 'Unknown',
        team: team?.short_name || '',
        position: type?.singular_name_short || '',
        slot: pick.position,
        onBench: pick.position > 11,
        multiplier,
        pointsBasis,
        minutes: Number(liveStats?.minutes || 0),
        isCaptain: !!pick.is_captain,
        isViceCaptain: !!pick.is_vice_captain,
        status: finished ? 'final' : started ? 'live' : 'upcoming',
        livePoints,
        expectedPoints: Math.round(epThis * 10) / 10,

        /*
          Season-to-date stats, used by the squad comparison view to
          give a "realistic" read on a still-to-play player rather
          than just a bare projected-points number - goals/assists/
          clean sheets/bonus so far this season, and FPL's own doubt
          flag for players who might not even play.
        */
        goals: element ? Number(element.goals_scored || 0) : 0,
        assists: element ? Number(element.assists || 0) : 0,
        cleanSheets: element ? Number(element.clean_sheets || 0) : 0,
        bonus: element ? Number(element.bonus || 0) : 0,
        form: element ? Number(element.form || 0) : 0,
        chanceOfPlaying: element?.chance_of_playing_this_round ?? null
      };
    });

  const { autoSubs, captainFallback } =
    applyAutoSubsAndCaptaincy(picks, picksData.active_chip);

  const autoSubOutIds = new Set(autoSubs.map(sub => sub.outId));
  const autoSubInIds = new Set(autoSubs.map(sub => sub.inId));

  /*
    Multipliers may have just changed (auto-subs and/or the
    captaincy fallback), so points contribution, the team total, and
    who counts as a "top contributor" are all finalized here, after
    that.
  */
  let predictedTotal = 0;
  const contributions = [];
  let everyStarterFinished = true;
  let anyStarterStarted = false;

  for (const player of picks) {

    const contribution = player.pointsBasis * player.multiplier;

    player.predictedContribution = Math.round(contribution * 10) / 10;

    player.substitutedOut = autoSubOutIds.has(player.id);
    player.substitutedIn = autoSubInIds.has(player.id);

    predictedTotal += contribution;

    if (player.multiplier > 0) {
      anyStarterStarted = anyStarterStarted || player.status !== 'upcoming';
      everyStarterFinished = everyStarterFinished && player.status === 'final';
      contributions.push(player);
    }

  }

  contributions.sort((a, b) => b.predictedContribution - a.predictedContribution);

  const captain = picks.find(player => player.isCaptain) || null;
  const viceCaptain = picks.find(player => player.isViceCaptain) || null;
  const startingXI = picks.filter(player => !player.onBench);

  /*
    FPL's own "points" field for a single Gameweek is the RAW score
    BEFORE any transfer-cost hit - the hit only ever shows up baked
    into the season-long running total (entry_history.total_points),
    never in the per-GW figure itself. Both actualPoints (FPL's own
    official figure) and predictedTotal (this module's own live
    estimate) net it out here, once, so nothing downstream can
    accidentally show a manager's points before their hit is
    applied.
  */
  const transferCost = picksData.entry_history?.event_transfers_cost ?? 0;
  const netPredictedTotal = predictedTotal - transferCost;

  return {
    activeChip: picksData.active_chip || null,
    activeChipLabel: chipLabel(picksData.active_chip),
    actualPoints:
      picksData.entry_history?.points != null
        ? picksData.entry_history.points - transferCost
        : null,
    transfers: picksData.entry_history?.event_transfers ?? 0,
    transferCost,
    predictedTotal: Math.round(netPredictedTotal * 10) / 10,
    liveStatus:
      !anyStarterStarted
        ? 'upcoming'
        : everyStarterFinished
          ? 'final'
          : 'live',
    captain,
    viceCaptain,
    topContributors: contributions.slice(0, 3),
    startingXI,
    bench: picks.filter(player => player.onBench),
    autoSubs,
    captainFallback,
    // Auto-subs/captaincy fallback are computed as soon as a
    // player's own match is finished (see isPlayerOut) - true/final
    // only once FPL has fully data-checked the whole Gameweek.
    autoSubsFinal: gwDataChecked
  };
}
