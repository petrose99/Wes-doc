/* DocuBite skin for the Bigcapital webapp, injected by nginx (see nginx.conf sub_filter).
 * Keeps the app on the light Blueprint theme and adds a "Back to DocuBite" pill that returns
 * to the workspace that opened accounting (URL handed over by auth-bridge.html). */
(function () {
  var DARK = "bp4-dark";

  /* preload-theme.js reads localStorage["theme"] before the app boots and adds bp4-dark when it
   * says "dark" or when the OS prefers dark, and the app's own theme control writes the same key.
   * Pinning it is what actually keeps accounting light; stripping the class below is the fallback
   * for a page that got it anyway. */
  function pinLightTheme() {
    try {
      localStorage.setItem("theme", "light");
    } catch (e) {
      /* storage unavailable — the class strip below still handles it */
    }
  }

  /* Idempotent ON PURPOSE, and it must stay that way. classList.remove() writes the class
   * attribute even when the token was already absent, and writing an attribute queues a mutation
   * record whether or not the value changed. An unguarded remove() inside the observer below
   * therefore re-triggers itself forever and locks the tab up — Chrome puts up "page isn't
   * responding" and no click ever lands. */
  function lighten() {
    var root = document.documentElement;
    if (root && root.classList.contains(DARK)) root.classList.remove(DARK);
    if (document.body && document.body.classList.contains(DARK)) document.body.classList.remove(DARK);
  }

  function addBackButton() {
    if (document.getElementById("db-back")) return;
    if (!document.body) return;
    var url;
    try {
      url = localStorage.getItem("docubite:return-url");
    } catch (e) {
      /* storage unavailable — fall through to default */
    }
    var a = document.createElement("a");
    a.id = "db-back";
    a.href = url || "/";
    a.textContent = "← Back to DocuBite";
    document.body.appendChild(a);
  }

  function init() {
    pinLightTheme();
    lighten();
    addBackButton();
    // The SPA re-renders and Blueprint may re-add the dark class; keep stripping it. Safe only
    // because lighten() writes nothing when there is nothing to strip — see the note above.
    var observer = new MutationObserver(lighten);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
