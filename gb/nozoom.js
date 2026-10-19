// No pinch / double-tap / ctrl+wheel zoom anywhere in the game (the Unity ports' canvas never zooms either).
// CSS touch-action covers modern Android/iOS; the listeners cover older iOS Safari (gesture* events, 2-finger
// touchmove) and desktop trackpad pinch (ctrl + wheel). Runs in both pages: the loading page and the game.
// Single-finger input is untouched: the client's swipes, d-pad and their own touch-action rules work as delivered.
(function () {
  "use strict";
  function stop(e) { if (e.cancelable) e.preventDefault(); }
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) { document.addEventListener(t, stop, { passive: false }); });
  document.addEventListener("touchmove", function (e) { if (e.touches.length > 1) stop(e); }, { passive: false });
  document.addEventListener("wheel", function (e) { if (e.ctrlKey) stop(e); }, { passive: false });
  document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].indexOf(e.key) >= 0) stop(e); });
})();
