// GameBull hooks into the client's page. A classic script the build puts right AFTER their niigata.js, so their files
// stay exactly as delivered: their top-level functions (loadLevel, update, requestMove, result, pauseMenu...) are
// globals this file wraps, and their top-level `let`s (game, index, sound, audio, ready, dialog...) are shared with
// every classic script. The GameBull shell (main.tsx, a module) talks only to window.NGClient below.
//
// A GameBull run (tournament / Score Challenge / solo / room), as agreed for this game:
//  - starts at stage 1 (the same stages for every player) and plays their stages in order;
//  - every stage has the client's own time, cells x 3 s (their 目安時間, niigata.js update()), made strict as in
//    their own GameBull mode: it starts when the stage appears and keeps running while paused;
//  - a clear loads the next stage at once with its own time; a dead end (or their やり直す) restarts the same
//    stage with the time it has left; the stage time reaching 0 ends the run (0.7 s zero hold, then the board);
//  - score = stages cleared x 1000 + the client's own points (their game.score) of those stages.
(function () {
  "use strict";
  var gate = window.__ngGate;
  var hooks = { onLock: null, onZero: null, onEnd: null };   // set by the shell
  var STAGE_POINTS = 1000;
  var R = null;            // the current GameBull run, null under the lobby / in their Stage Mode
  var last = null;         // the last run's facts
  var now = function () { return performance.now(); };
  var devStage = 0;        // localhost build only: ?devSeconds=N gives every stage N seconds (set by the shell)

  function stageMs(i) { return (devStage > 0 ? devStage : LEVELS[i].cells.length * 3) * 1000; }
  function total() { return R ? R.cleared * STAGE_POINTS + R.points : 0; }
  function live() { return !!R && !R.held && !R.locked && !R.ended; }
  function remainingMs() {
    if (!R) return 0;
    if (R.held) return stageMs(index);
    if (R.zero) return 0;
    var r = R.stageEndsAt - now();
    if (R.limitEndsAt) r = Math.min(r, R.limitEndsAt - now());
    return Math.max(0, r);
  }
  // Their timer box: their GameBull-mode label (残り時間) and the run's time, in their own clock() format.
  function showTimer() {
    if (!R) return;
    var label = document.querySelector(".timer small");
    if (label && label.textContent !== "残り時間") label.textContent = "残り時間";
    $("timer").textContent = clock(remainingMs() / 1000);
  }

  // ---- their functions, wrapped ----
  var clientLoad = loadLevel;
  loadLevel = function (i) {
    clientLoad(i);
    if (!R) return;
    // A new stage gets its own time; the same stage again (dead end, their やり直す) keeps what it has left.
    var restart = i === R.stage && !R.fresh;
    R.fresh = false; R.stage = i;
    if (!restart) R.stageEndsAt = now() + stageMs(i);
    console.log("[NG-GB] Stage " + (i + 1) + (restart ? " restarted, " + Math.ceil(remainingMs() / 1000) + " s left" : " loaded: " + Math.round(stageMs(i) / 1000) + " s (" + LEVELS[i].cells.length + " cells x 3 s)") + "; run score " + total() + ".");
    showTimer();
  };
  var clientUpdate = update;
  update = function () { clientUpdate(); showTimer(); };   // their update() writes the free-game time; show the run's
  var clientRequestMove = requestMove;
  requestMove = function (dx, dy) { if (R && !live()) return; clientRequestMove(dx, dy); };
  var clientPauseMenu = pauseMenu;
  pauseMenu = function () { if (R && !live()) return; clientPauseMenu(); };

  // Their result() (called by their frame() one beat after the last move) opens their result dialog; in a run the
  // run rules take over: a clear goes on to the next stage, a dead end restarts the stage.
  var clientResult = result;
  result = function () {
    if (!R) return clientResult();
    if (R.locked || R.ended) return;
    if (game.state === "won") {
      R.cleared++; R.points += game.score; R.steps += game.visited.size; R.bonus += game.score - game.visited.size * 10;
      beep(600, .18);   // their clear sound (their result())
      console.log("[NG-GB] Stage " + (index + 1) + " cleared: +" + STAGE_POINTS + " +" + game.score + " (their points); run: " + R.cleared + " stages, score " + total() + ".");
      if (R.target > 0 && total() >= R.target) {
        R.locked = true; hooks.onLock && hooks.onLock("target");
        console.log("[NG-GB] Challenge target " + R.target + " reached at " + total() + "; ending in 0.9 s.");
        setTimeout(function () { end("target"); }, 900);
        return;
      }
      if (index + 1 >= LEVELS.length) { R.locked = true; hooks.onLock && hooks.onLock("all"); end("all-cleared"); return; }
      loadLevel(index + 1);
    } else if (game.state === "lost") {
      console.log("[NG-GB] Stage " + (index + 1) + ": dead end (" + game.visited.size + "/" + game.cells.size + "); restarting it with " + Math.ceil(remainingMs() / 1000) + " s left.");
      var at = index;
      setTimeout(function () { if (live() && index === at && game.state === "lost") loadLevel(at); }, 600);
    }
  };

  // Their GB calls (client-pre.js gate) during a run.
  gate.over.timer = function () { showTimer(); };
  gate.over.tick = function () {
    if (!R) return;
    if (R.held) { R.stageEndsAt = now() + stageMs(index); return; }
    // A stage solved in time counts even if its time runs out during their clear beat.
    if (live() && game.state !== "won" && remainingMs() <= 0) timeUp();
  };
  gate.over.openMap = function () { return !!R; };                     // no stage list during a run
  gate.over.retry = function () { return !!R && !live(); };             // their やり直す works in a live run

  function timeUp() {
    R.locked = true; R.zero = true; queued = null;
    if (dialog.open) dialog.close();
    console.log("[NG-GB] Stage " + (index + 1) + " time is up: run ends with " + R.cleared + " stages cleared, score " + total() + ".");
    hooks.onLock && hooks.onLock("clock");
    if (hooks.onZero) hooks.onZero(function () { end("timeout"); }); else setTimeout(function () { end("timeout"); }, 700);
  }
  function end(reason) {
    if (!R || R.ended) return;
    R.ended = true; R.locked = true; queued = null;
    if (dialog.open) dialog.close();
    last = { reason: reason, stages: R.cleared, stagePoints: R.cleared * STAGE_POINTS, points: R.points, steps: R.steps, bonus: R.bonus,
      total: total(), reached: index + 1, playMs: Math.round(now() - R.startedAt) };
    console.log("[NG-GB] Run end '" + reason + "': " + last.stages + " stages cleared (x" + STAGE_POINTS + " = " + last.stagePoints + "), their points " + last.points +
      " (" + last.steps + " cells x 10 + straight bonus " + last.bonus + "), total " + last.total + "; last stage on screen " + last.reached + ".");
    hooks.onEnd && hooks.onEnd(last);
  }

  // ---- sound ----
  // GameBull: sound ON until the player chooses (their own default is OFF: niigata.js reads 'farming-sound').
  // The GameBull mute and their own pause-menu toggle (効果音) are the same switch: their `sound` and their key.
  try { if (localStorage.getItem("farming-sound") === null) { sound = true; console.log("[NG-GB] Sound ON by default (no saved choice yet)."); } } catch (e) { /* private mode */ }
  // iPhone / Safari: their beeps are Web Audio, made by beep() on the player's moves. iPhone only starts a context
  // inside a tap and plays Web Audio under the silent switch, so while their sound is ON their context is created /
  // resumed (and primed) on the player's taps, and the audio session is "playback" (iOS 16.4+).
  try { if (navigator.audioSession) { navigator.audioSession.type = "playback"; console.log("[NG-GB] Audio session set to playback."); } } catch (e) { /* n/a */ }
  var primedFor = null, unlocked = false;
  function unlock() {
    if (!sound) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();   // the same context their beep() makes
      if (primedFor !== audio) { primedFor = audio; var s = audio.createBufferSource(); s.buffer = audio.createBuffer(1, 1, 22050); s.connect(audio.destination); s.start(0); }
      var c = audio, ok = function () { if (!unlocked && c.state === "running") { unlocked = true; console.log("[NG-GB] Game sound unlocked by a tap (Web Audio running)."); } };
      if (c.state === "running") ok(); else c.resume().then(ok).catch(function () {});
    } catch (e) { /* no Web Audio */ }
  }
  ["touchend", "pointerup", "click", "keydown"].forEach(function (t) { document.addEventListener(t, unlock, { capture: true, passive: true }); });

  // ---- localhost autoplay: their own requestMove(), path found on their board ----
  var plan = null;
  function solveFromHere() {
    var cells = game.cells, seen = new Set(game.visited), path = [], budget = 300000, D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    function dfs(p) {
      if (seen.size === cells.size) return true;
      if (--budget < 0) return false;
      for (var k = 0; k < 4; k++) {
        var n = [p[0] + D[k][0], p[1] + D[k][1]], key = n.join(",");
        if (cells.has(key) && !seen.has(key)) { seen.add(key); path.push(D[k]); if (dfs(n)) return true; path.pop(); seen.delete(key); }
      }
      return false;
    }
    return dfs(game.position) ? path : null;
  }

  window.NGClient = {
    hooks: hooks,
    // Under the lobby: stage 1 on their page, no run.
    park: function () {
      R = null; gate.run = false; gate.stage = false;
      if (dialog.open) dialog.close();
      clientLoad(0);
      var label = document.querySelector(".timer small"); if (label) label.textContent = "目安時間";
    },
    // A run: stage 1, the client's per-stage time; a challenge may cap the whole run (limitMs) and holds the board
    // under the 5..1 GO intro (hold).
    start: function (opt) {
      opt = opt || {};
      devStage = opt.devStageSeconds || 0;
      R = { target: opt.target || 0, limitMs: opt.limitMs || 0, limitEndsAt: 0, held: !!opt.hold, locked: false, zero: false, ended: false,
        fresh: true, stage: -1, stageEndsAt: 0, cleared: 0, points: 0, steps: 0, bonus: 0, startedAt: now() };
      gate.run = true; gate.stage = false; plan = null;
      if (dialog.open) dialog.close();
      loadLevel(0);
      if (!R.held) this.go();
    },
    go: function () {
      if (!R) return;
      R.held = false; R.startedAt = now(); R.stageEndsAt = now() + stageMs(index);
      if (R.limitMs) R.limitEndsAt = now() + R.limitMs;
      console.log("[NG-GB] Run started at stage " + (index + 1) + (R.limitMs ? "; challenge limit " + Math.round(R.limitMs / 1000) + " s." : "."));
      showTimer();
    },
    totalScore: function () { return R ? total() : last ? last.total : 0; },
    remaining: function () { return R && !R.ended ? remainingMs() / 1000 : 0; },
    isRunning: live,
    soundOn: function () { return !!sound; },
    setSound: function (on) { sound = !!on; try { localStorage.setItem("farming-sound", String(sound)); } catch (e) { /* private */ } if (sound) beep(450); },
    // The lives in their header during a run: their own label for a connected game (GameBull連携).
    showLives: function (n) {
      $("life-count").textContent = n == null ? "—" : String(n);
      var s = document.querySelector(".life-display small"); if (s) s.textContent = "GameBull連携";
    },
    autoStep: function () {
      if (!live() || animation || dialog.open || !["ready", "playing"].includes(game.state)) return;
      if (!plan || plan.stage !== index || plan.at !== game.visited.size) { var p = solveFromHere(); plan = p ? { stage: index, at: game.visited.size, moves: p } : null; }
      if (!plan || !plan.moves.length) { requestMove.apply(null, [[0, 1], [1, 0], [0, -1], [-1, 0]].find(function (d) { return game.canMove(d[0], d[1]); }) || [0, 1]); return; }
      var d = plan.moves.shift(); plan.at++; requestMove(d[0], d[1]);
    },
  };
  window.dispatchEvent(new Event("ngclient-ready"));
})();
