// GameBull hooks for the client's page (app.html = their index.html; build.mjs adds this script after their
// niigata.js). Their files are never edited, and this file does not touch their gameplay, timer, Stage Mode adapter
// or screens. It reads their top-level bindings (classic scripts share them): `audio`, `sound`, `ready`, `sprites`.
//  1. [GB-VERSION] line, as on every GameBull build.
//  2. iPhone / Safari sound (the Tile Master build 3 / Klondike build 2 lesson): their beeps are Web Audio, made
//     lazily by beep() when their sound setting is ON (OFF by default, their design). iPhone Safari only starts a
//     Web Audio context inside a tap, and plays Web Audio under the ring/silent switch. So, only while THEIR sound
//     is ON: their context is created / resumed (and primed with one silent sample) on the player's taps, again
//     after any iOS interruption; and on iOS 16.4+ the page's audio session is "playback". Sound OFF stays silent.
//  3. The loading page (index.html) comes down when their pictures are in and their GameBull connection screen
//     ("GameBullに接続中…") has given way to the stage map or their own message.
(function () {
  "use strict";
  var ENV = window.GB_ENV || {};
  console.log("[GB-VERSION] Build v" + ENV.BUILD_VERSION);
  console.log("[NG-GB] API " + window.GAMEBULL_CONFIG.apiBase + " · gameCode " + window.GAMEBULL_CONFIG.gameCode +
    " · token param " + window.GAMEBULL_CONFIG.bootTokenParam + " · lives " + window.GAMEBULL_CONFIG.livesPath);

  // ---- 2. sound on iPhone ----
  try {
    if (navigator.audioSession) { navigator.audioSession.type = "playback"; console.log("[NG-GB] Audio session set to playback (iOS: the game's beeps play like media)."); }
  } catch (e) { /* not supported */ }
  var primedFor = null, logged = false;
  function unlock() {
    if (!sound) return; // their setting: no audio at all while it is OFF
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); // the same context their beep() makes
      if (primedFor !== audio) { // one silent sample inside the gesture is what unlocks iOS
        primedFor = audio;
        var s = audio.createBufferSource(); s.buffer = audio.createBuffer(1, 1, 22050); s.connect(audio.destination); s.start(0);
      }
      var c = audio;
      var ok = function () { if (!logged && c.state === "running") { logged = true; console.log("[NG-GB] Game sound unlocked by a tap (Web Audio running)."); } };
      if (c.state === "running") ok(); else c.resume().then(ok).catch(function () {});
    } catch (e) { /* no Web Audio */ }
  }
  ["touchend", "pointerup", "click", "keydown"].forEach(function (t) { document.addEventListener(t, unlock, { capture: true, passive: true }); });

  // ---- 3. loading page ----
  var t0 = performance.now(), sent = false;
  function parentCall(name, arg) { try { if (window.parent !== window && window.parent[name]) window.parent[name](arg); } catch (e) { /* opened alone */ } }
  function connecting() {
    var m = document.getElementById("modal-content");
    return !!(m && dialog.open && m.textContent.indexOf("接続中") >= 0);
  }
  var poll = setInterval(function () {
    parentCall("gbLoaderProgress", Object.keys(sprites).length / assetNames.length);
    var timedOut = performance.now() - t0 > 30000;
    if ((ready && !connecting()) || timedOut) {
      clearInterval(poll);
      if (sent) return; sent = true;
      console.log("[NG-GB] Page ready (" + Object.keys(sprites).length + "/" + assetNames.length + " pictures" + (timedOut ? ", 30 s cap" : "") + ").");
      parentCall("gbLoaderDone");
    }
  }, 100);
})();
