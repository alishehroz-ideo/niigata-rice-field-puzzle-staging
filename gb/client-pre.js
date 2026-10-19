// GameBull gate for the client's own GameBull adapter (their game/gamebull-ui.js, the `GB` object). A classic script
// the build puts right AFTER their gamebull-ui.js and BEFORE their niigata.js, so it runs before their niigata.js
// calls GB.initialize() on load. Their files are unchanged.
// Their adapter is the client's Stage-Clear Mode (their stage map, 1 life per stage start, server progress, voucher),
// built from GameBull's Stage Mode Integration Guide. Which flow a launch gets is the SERVER's call (the guide):
//  - /context has `stageMode`: the shell opens the gate (window.__ngGate.stage = true) and calls their own
//    GB.initialize(); from then on every GB call is theirs, as delivered, and no GameBull screen is drawn;
//  - `stageMode` is null: the gate stays closed, their page behaves as their own free game (their `!enabled` paths),
//    and client-hooks.js runs the GameBull run rules (lobby, tournaments, Score Challenge) on top.
// Their adapter files ship unchanged.
(function () {
  "use strict";
  var gate = window.__ngGate = { stage: false, run: false, orig: {}, over: {} };
  var enabled = GB.enabled; // their const: true under any launch URL
  // Their `GB.enabled` is read by their stage list and help text. In their Stage Mode it is theirs; in a GameBull run
  // it is true too, so their help text shows their own strict-time sentence (GameBullの残り時間がゼロになると挑戦終了。
  // 一時停止中も時間は進みます。), which is the run's rule; under the lobby it is false (their free-game paths).
  Object.defineProperty(GB, "enabled", { get: function () { return enabled && (gate.stage || gate.run); } });
  // What their page sees outside their Stage Mode: their own `!enabled` answers (gamebull-ui.js).
  var free = {
    initialize: function () {},            // their connection screen + stage map: only once the server says Stage Mode
    canMove: function () { return true; },
    canChoose: function () { return true; },
    info: function () { return ""; },
    pick: function (stage) { dialog.close(); loadLevel(stage - 1); },
    retry: function () { return false; },
    result: function () { return false; },
    tick: function () {},
    timer: function () {},
    openMap: function () { return false; },
    canClose: function () { return true; },
    captureWin: function () {},
    totalStages: function () { return LEVELS.length; },
    isCleared: function () { return false; },
    label: function () { return ""; },
  };
  Object.keys(GB).forEach(function (k) {
    if (typeof GB[k] !== "function") return;
    var mine = GB[k];
    gate.orig[k] = mine;
    GB[k] = function () {
      if (gate.stage) return mine.apply(GB, arguments);
      if (gate.over[k]) return gate.over[k].apply(GB, arguments);   // client-hooks.js: GameBull run rules
      return free[k] ? free[k].apply(GB, arguments) : mine.apply(GB, arguments);
    };
  });
  console.log("[NG-GB] Their Stage-Clear Mode adapter is gated: it opens when /context has stageMode.");
})();
