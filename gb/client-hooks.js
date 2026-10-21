// GameBull hooks into the client's page. A classic script the build puts right AFTER their niigata.js, so their files
// stay exactly as delivered: their top-level functions (loadLevel, update, requestMove, result, pauseMenu...) are
// globals this file wraps, and their top-level `let`s (game, index, sound, audio, ready, dialog...) are shared with
// every classic script. The GameBull shell (main.tsx, a module) talks only to window.NGClient below.
//
// A GameBull run (tournament / Score Challenge / solo / room), as agreed for this game:
//  - starts at stage 1 (the same stages for every player) and plays their stages in order;
//  - every stage has the client's own time, cells x 3 s (their 目安時間, niigata.js update()), made strict as in
//    their own GameBull mode: it starts when the stage appears;
//  - 3 hearts (GameBull run rule, agreed 2026-10-19). Two ways to lose one: a reset (their やり直す, or a dead end,
//    which can only be reset) and the stage time reaching 0 (0.7 s zero hold first). The stage then restarts with its
//    full time. The 3rd heart lost ends the run (then the board);
//  - a clear loads the next stage at once with its own time;
//  - score = stages cleared x 1000 + the client's own points (their game.score) of those stages.
(function () {
  "use strict";
  var gate = window.__ngGate;
  var hooks = { onLock: null, onZero: null, onResume: null, onEnd: null };   // set by the shell
  var HEARTS = 3;
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
    // Their やり直す (button, R key, their confirm dialog) reloads the same stage: in a run that reset costs a heart
    // when the stage had been played (a reset of an untouched stage changes nothing and is free).
    var reset = !!R && !R.fresh && !R.paid && i === R.stage && game && game.visited.size > 0;
    if (reset) { loseHeart(game.state === "lost" ? "dead end, reset" : "reset (their やり直す)"); if (R.locked) return; }   // 3rd heart: no reload, the run ends
    clientLoad(i);
    if (!R) return;
    R.fresh = false; R.paid = false; R.stage = i;
    R.stageEndsAt = now() + stageMs(i);
    console.log("[NG-GB] Stage " + (i + 1) + " loaded: " + Math.round(stageMs(i) / 1000) + " s (" + LEVELS[i].cells.length + " cells x 3 s); run score " + total() + ", hearts " + R.hearts + ".");
    showTimer();
  };
  var clientUpdate = update;
  update = function () { clientUpdate(); showTimer(); };   // their update() writes the free-game time; show the run's
  var clientRequestMove = requestMove;
  requestMove = function (dx, dy) { if (R && !live()) return; clientRequestMove(dx, dy); };
  // GameBull run rule: no pause and no in-game menu during a run (playbook). Their pause button is hidden for the run
  // (its space kept, so their lives box does not move) and their P key / background auto-pause open nothing.
  var clientPauseMenu = pauseMenu;
  pauseMenu = function () { if (R) return; clientPauseMenu(); };
  function pauseButton(show) { var b = $("pause"); if (b) b.style.visibility = show ? "" : "hidden"; }
  // Their ライフ box (GameBull account lives) is not shown in a run: the run's 3 hearts are drawn in its place.
  function livesBox(show) { var b = document.querySelector(".life-display"); if (b) b.style.visibility = show ? "" : "hidden"; }
  // Their 最高記録 (best score per stage, saved in the browser by their own result screen) is not kept in a run, so
  // it would always read "—"; and their stage list cannot be opened in a run, so its ▾ goes too. Both hidden for
  // the run only (space kept, their panel does not shift).
  function runOnlyHud(show) {
    [".score-block .best", "#levels > span"].forEach(function (sel) { var e = document.querySelector(sel); if (e) e.style.visibility = show ? "" : "hidden"; });
  }

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
      console.log("[NG-GB] Stage " + (index + 1) + ": dead end (" + game.visited.size + "/" + game.cells.size + "); it is reset, which costs a heart.");
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

  // A heart lost: the 3rd one ends the run.
  function loseHeart(why) {
    if (!R || R.ended) return;
    R.hearts = Math.max(0, R.hearts - 1);
    console.log("[NG-GB] Heart lost on stage " + (index + 1) + " (" + why + "): " + R.hearts + " left.");
    if (R.hearts <= 0) { R.locked = true; hooks.onLock && hooks.onLock("hearts"); setTimeout(function () { end("hearts"); }, 700); }
  }
  // Stage time at 0: hold "0" for 0.7 s (the shell's countdown), lose a heart, then the stage restarts with its
  // full time, or the run ends on the 3rd heart.
  function timeUp() {
    R.locked = true; R.zero = true; queued = null;
    if (dialog.open) dialog.close();
    console.log("[NG-GB] Stage " + (index + 1) + " time is up.");
    var after = function () {
      if (!R || R.ended) return;
      R.hearts = Math.max(0, R.hearts - 1);
      console.log("[NG-GB] Heart lost on stage " + (index + 1) + " (time up): " + R.hearts + " left.");
      if (R.hearts <= 0) { hooks.onLock && hooks.onLock("hearts"); end("hearts"); return; }
      R.zero = false; R.locked = false; R.paid = true;
      loadLevel(index);
      hooks.onResume && hooks.onResume();
    };
    if (hooks.onZero) hooks.onZero(after); else setTimeout(after, 700);
  }
  function end(reason) {
    if (!R || R.ended) return;
    R.ended = true; R.locked = true; queued = null;
    if (dialog.open) dialog.close();
    last = { reason: reason, hearts: R.hearts, stages: R.cleared, stagePoints: R.cleared * STAGE_POINTS, points: R.points, steps: R.steps, bonus: R.bonus,
      total: total(), reached: index + 1, playMs: Math.round(now() - R.startedAt) };
    console.log("[NG-GB] Run end '" + reason + "': " + last.stages + " stages cleared (x" + STAGE_POINTS + " = " + last.stagePoints + "), their points " + last.points +
      " (" + last.steps + " cells x 10 + straight bonus " + last.bonus + "), total " + last.total + "; last stage on screen " + last.reached + ".");
    hooks.onEnd && hooks.onEnd(last);
  }

  // ---- sound ----
  // GameBull flow only: sound ON until the player chooses (their own default is OFF: niigata.js reads
  // 'farming-sound'); their Stage-Clear Mode keeps their default. The GameBull mute and their own pause-menu toggle
  // (効果音) are the same switch: their `sound` and their key.
  function gameBullSoundDefault() {
    try { if (localStorage.getItem("farming-sound") === null) { sound = true; console.log("[NG-GB] Sound ON by default (no saved choice yet)."); } } catch (e) { /* private mode */ }
  }
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

  // ---- their Stage-Clear Mode: closing a popup never leaves a dead board ----
  // In their Stage Mode a stage can only be played after their 1-life start; with no attempt running, their board
  // does not move, their timer shows "—" and their pause opens only on a ready / playing stage (niigata.js). Their ×
  // (and Esc) simply closed any popup onto that board.
  //  - QA 2026-10-20: × on a cleared / failed result left the finished board on screen ("stuck, pause does nothing").
  //  - Bug list 2026-10-21 (#1): × on their stage list without choosing a stage showed stage 1 with no controls or
  //    timer; (#2): after build 10, × on the stage list reopened the list, so the button looked broken. Asked for:
  //    "remove the Close button or make it return the player to the main menu, where the player selects the game
  //    mode" = the GameBull app's game page (Play Stage Mode / Game Start).
  // So, in their Stage Mode, while NO attempt is running:
  //  - × / Esc on their stage list closes the game back to the GameBull app (gamebull:close, through the loading
  //    page's relay, like the TOP button); opened outside the app there is nowhere to go back to, so the list stays;
  //  - × / Esc on any other popup (result, out of lives, confirm, notices) opens their stage list (their own
  //    GB.openMap(), exactly as their 田んぼ一覧 button; it also resends an unsent clear first).
  // While an attempt IS running (e.g. their 田んぼ一覧 or pause opened mid-stage), × is theirs, unchanged.
  function noAttempt() { return gate.stage && !GB.canMove(); }
  function onStageList() { var k = document.getElementById("modal-kicker"); return !!k && k.textContent === "田んぼを選ぶ"; }
  var clientCloseModal = closeModal;
  closeModal = function () {   // their Esc handler (dialog 'cancel') calls closeModal() by name
    if (!noAttempt() || !GB.canClose()) return clientCloseModal();
    if (!onStageList()) { console.log("[NG-GB] Stage Mode: popup closed with no stage running; opening their stage list."); GB.openMap(); return; }
    if (!embedded()) { console.log("[NG-GB] Stage Mode: stage list closed outside the GameBull app; nothing to return to, the list stays."); return; }
    console.log("[NG-GB] Stage Mode: stage list closed with no stage running; back to the GameBull game page (gamebull:close).");
    window.parent.postMessage({ type: "gamebull:close" }, location.origin);
  };
  var closeBtn = document.getElementById("close-modal");   // their × keeps the reference it got on load: catch it first
  if (closeBtn) closeBtn.addEventListener("click", function (e) {
    if (!noAttempt()) return;
    e.stopImmediatePropagation(); e.preventDefault(); closeModal();
  }, true);

  // ---- their voucher button inside the GameBull app ----
  // Their 「GameBullでギフト券を開く」 (gamebull-ui.js rewardHtml: <a class="gb-coupon" href=reward.redeemUrl
  // target="_blank">) cannot open inside the GameBull app: its game frame has no allow-popups / allow-top-navigation.
  // Embedded, the tap closes the game the way the app's Done button does (gamebull:close, through the loading page's
  // relay), and names the coupon page `to: /coupons/<id>` for when the app opens it (ignored by the app today; the
  // coupon is already in the player's Coupons). Opened outside the app, their link works as they made it.
  function embedded() { try { return window.parent !== window && window.parent.parent !== window.parent; } catch (e) { return true; } }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a.gb-coupon");
    if (!a || !embedded()) return;
    e.preventDefault(); e.stopPropagation();
    var to;
    try { var u = new URL(a.href); if (/^\/coupons\/[^/]+$/.test(u.pathname)) to = u.pathname; } catch (err) { /* no path */ }
    var msg = { type: "gamebull:close" }; if (to) msg.to = to;
    console.log("[NG-GB] Voucher button inside the GameBull app: closing the game " + JSON.stringify(msg) + ".");
    window.parent.postMessage(msg, location.origin);
  }, true);

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
      pauseButton(true); livesBox(true); runOnlyHud(true);
      clientLoad(0);
      var label = document.querySelector(".timer small"); if (label) label.textContent = "目安時間";
    },
    // A run: stage 1, the client's per-stage time; a challenge may cap the whole run (limitMs) and holds the board
    // under the 5..1 GO intro (hold).
    start: function (opt) {
      opt = opt || {};
      devStage = opt.devStageSeconds || 0;
      R = { target: opt.target || 0, limitMs: opt.limitMs || 0, limitEndsAt: 0, held: !!opt.hold, locked: false, zero: false, ended: false,
        fresh: true, paid: false, hearts: HEARTS, stage: -1, stageEndsAt: 0, cleared: 0, points: 0, steps: 0, bonus: 0, startedAt: now() };
      gate.run = true; gate.stage = false; plan = null;
      if (dialog.open) dialog.close();
      pauseButton(false); livesBox(false); runOnlyHud(false);
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
    hearts: function () { return R ? R.hearts : last ? last.hearts : HEARTS; },
    soundOn: function () { return !!sound; },
    setSound: function (on) { sound = !!on; try { localStorage.setItem("farming-sound", String(sound)); } catch (e) { /* private */ } if (sound) beep(450); },
    gameBullSoundDefault: gameBullSoundDefault,
    // The server says Stage Mode (/context stageMode): the client's own Stage-Clear Mode, exactly as they built it
    // (their connection screen, stage map, 1-life confirm, results, voucher, their HUD and pause menu, their APIs).
    enterStageMode: function () {
      R = null; gate.run = false; gate.stage = true; plan = null;
      if (dialog.open) dialog.close();
      pauseButton(true); livesBox(true); runOnlyHud(true);
      console.log("[NG-GB] Stage Mode launch: the client's own Stage-Clear Mode takes over (their GB.initialize()).");
      GB.initialize();
    },
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
