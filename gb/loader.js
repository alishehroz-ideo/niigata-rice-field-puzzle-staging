// Loading page logic (the Unity template's inline script, same rules as the Klondike / Blackjack web ports): the
// tenant's per-game icon from /context, the built-in icon after 4 s while the lookup keeps going up to 30 s, never
// crossOrigin, and a full teardown when the game is ready. Same API base as the game (gb/env.js), so they cannot
// drift; the base never comes from the query (the client's rule too). The game (app.html) runs in the frame below
// and calls window.gbLoaderDone() when their page is ready (gb/hooks.js).
// A Unity game took seconds to download, which gave the tenant icon time to show; this page is ready almost at
// once, so the loading page stays up until an icon (tenant's, or the built-in one at 4 s) has been seen for 2 s.
(function () {
  "use strict";
  var ENV = window.GB_ENV;
  var SHOW_BUILTIN_AFTER_MS = 4000, GIVE_UP_AFTER_MS = 30000, ICON_MIN_VISIBLE_MS = 2000;
  var $ = function (s) { return document.querySelector(s); };

  // The game frame: same launch URL (tokens, tenant) for the client's page.
  var frame = $("#gb-frame");
  if (frame) frame.src = "./app.html" + location.search + location.hash;

  var iconShownAt = 0, appReady = false, done = false, finishTimer = null;
  function iconShown() {
    if (iconShownAt) return;
    iconShownAt = performance.now();
    console.log("[NG-LOAD] Loading icon visible at " + Math.round(iconShownAt) + " ms.");
    maybeFinish();
  }

  var progress = 0, real = -1;
  function setLoadProgress(p) {
    var pct = Math.round(p * 100), full = $("#unity-progress-bar-full"), txt = $("#unity-progress-percent");
    if (full) full.style.width = pct + "%";
    if (txt) txt.innerText = pct + "%";
  }
  // Until the game reports real progress the bar creeps to 10 %; then it follows the client's picture loading.
  var ease = setInterval(function () { if (real < 0) { progress = Math.min(0.1, progress + 0.01); setLoadProgress(progress); } }, 100);
  window.gbLoaderProgress = function (p) { real = p; progress = Math.max(progress, 0.1 + 0.88 * p); setLoadProgress(progress); };

  (function loadTenantIcon() {
    var spinner = $("#gb-spinner"), target = $("#gb-tenant-logo"), iconBox = $("#unity-logo"), builtinTimer = null;
    function stopSpinner() { if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner); }
    function showBuiltin() { if (iconBox) iconBox.classList.add("gb-fallback"); stopSpinner(); iconShown(); }
    function fallback() { if (builtinTimer) clearTimeout(builtinTimer); showBuiltin(); }
    try {
      var q = new URLSearchParams(location.search);
      var token = q.get("sessionToken") || q.get("bootToken") || q.get("token");
      var tenantSlug = q.get("tenantSlug");
      if (!tenantSlug || !token || !ENV || !ENV.BaseUrl) { fallback(); return; }
      builtinTimer = setTimeout(showBuiltin, SHOW_BUILTIN_AFTER_MS);
      var ctrl = "AbortController" in window ? new AbortController() : null;
      var giveUp = setTimeout(function () { if (ctrl) ctrl.abort(); }, GIVE_UP_AFTER_MS);
      var url = ENV.BaseUrl.replace(/\/+$/, "") + "/play/games/" + encodeURIComponent(ENV.GAME_ID) +
        "/context?tenantSlug=" + encodeURIComponent(tenantSlug) + "&_ts=" + Date.now();
      fetch(url, { method: "GET", headers: { Authorization: "Bearer " + token }, cache: "no-store", credentials: "omit",
        referrerPolicy: "no-referrer", signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          clearTimeout(giveUp);
          var c = data && data.customization;
          // Per-game fields only: logoUrl / assets[] are tenant-wide (another game's art on a shared tenant, trap 29).
          var iconUrl = c && typeof c.gameLogoUrl === "string" && c.gameLogoUrl ? c.gameLogoUrl
            : c && typeof c.gameBannerUrl === "string" && c.gameBannerUrl ? c.gameBannerUrl : null;
          if (!iconUrl || !target) { fallback(); return; }
          var img = new Image(); // no crossOrigin (trap 27)
          img.referrerPolicy = "no-referrer";
          img.onload = function () {
            if (builtinTimer) clearTimeout(builtinTimer);
            if (!target.parentNode) return;
            target.style.backgroundImage = 'url("' + iconUrl.replace(/"/g, "%22") + '")';
            target.classList.add("gb-ready");
            stopSpinner(); iconShown();
            setTimeout(function () { if (iconBox) iconBox.classList.remove("gb-fallback"); }, 300);
          };
          img.onerror = fallback;
          img.src = iconUrl;
        })
        .catch(function () { clearTimeout(giveUp); fallback(); });
    } catch (e) { fallback(); }
  })();

  function maybeFinish() {
    if (!appReady || !iconShownAt || done) return;
    var wait = Math.max(0, iconShownAt + ICON_MIN_VISIBLE_MS - performance.now());
    if (finishTimer) clearTimeout(finishTimer);
    finishTimer = setTimeout(teardown, wait);
  }
  window.gbLoaderDone = function () {
    if (appReady) return;
    appReady = true;
    console.log("[NG-LOAD] Game ready at " + Math.round(performance.now()) + " ms.");
    maybeFinish();
  };

  function teardown() {
    if (done) return; done = true;
    console.log("[NG-LOAD] Loading page down at " + Math.round(performance.now()) + " ms.");
    clearInterval(ease); setLoadProgress(1);
    ["#gb-spinner", "#gb-tenant-logo", "#unity-logo", "#unity-progress-bar-full", "#unity-progress-bar-empty",
      "#unity-progress-percent", "#unity-loading-bar", "#gb-loading"].forEach(function (sel) {
      var el = $(sel); if (!el) return;
      el.style.display = "none"; el.style.visibility = "hidden"; el.style.opacity = "0"; el.style.backgroundImage = "none";
      if (el.parentNode) el.parentNode.removeChild(el); // Safari keeps painting hidden children: remove them
    });
    try { window.parent.postMessage({ type: "game:ready" }, "*"); } catch (e) { /* not embedded */ }
  }
})();
