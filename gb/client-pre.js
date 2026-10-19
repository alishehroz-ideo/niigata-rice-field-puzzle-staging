// GameBull gate for the client's own GameBull adapter (their game/gamebull-ui.js, the `GB` object). A classic script
// the build puts right AFTER their gamebull-ui.js and BEFORE their niigata.js, so it runs before their niigata.js
// calls GB.initialize() on load. Their files are unchanged.
// Their adapter is the client's Stage-Clear Mode (their stage map, 1 life per stage start, server progress, voucher).
// The GameBull web build runs the standard GameBull flow (lobby, tournaments, Score Challenge), so their adapter is
// kept closed (window.__ngGate.stage stays false): their page behaves as their own free game (their `!enabled`
// paths), and client-hooks.js runs the GameBull rules on top. Their adapter files ship unchanged.
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
    initialize: function () {},            // their connection screen + stage map (their Stage-Clear Mode): not opened
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
  console.log("[NG-GB] Their Stage-Clear Mode adapter is kept closed (standard GameBull flow).");
})();
