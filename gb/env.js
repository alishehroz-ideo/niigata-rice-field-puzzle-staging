// GameBull environment: the ONE place the API base lives (trap 20). The loading page and the game page both load
// this file, and build.mjs writes the same base into the client's gamebull-config.js (their apiBase), so they
// cannot drift. Switch with `node gamebull/tools/env.mjs staging|production|report`; never edit the URL by hand.

// CURRENTLY: STAGING.
window.GB_ENV = Object.freeze({
  BaseUrl: "https://api.staging.g-b.store",
  // The client's gameCode (their gamebull-config.js, from GameBull's Stage Mode guide); register it in the admin.
  GAME_ID: "RICE_FIELD_PUZZLE",
  // Bump before every deploy build; the console prints `[GB-VERSION] Build vN`.
  BUILD_VERSION: 1,
});
