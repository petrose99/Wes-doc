/* DocuBite skin for the Bigcapital webapp, injected by nginx (see nginx.conf sub_filter).
 * Keeps the app on the light Blueprint theme and adds a "Back to DocuBite" pill that returns
 * to the workspace that opened accounting (URL handed over by auth-bridge.html). */
(function () {
  var DARK = "bp4-dark";

  /* Belt to nginx.conf's braces. The app bundle reads localStorage["theme"] at module-evaluation
   * time, which is well before this file runs, so the pin that actually prevents a dark flash is
   * the inline <head> script nginx injects. This one only matters if that filter ever stops
   * matching — and it still fixes the NEXT load. */
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

  /* The workspace URL auth-bridge.html stored on the way in. Rejected if it points at a loopback
   * address while this page is not itself served from one: that is a URL built from the app
   * container's own request rather than the site's public address, and it would otherwise sit in
   * storage sending people to localhost:7331 until their next sign-in overwrote it. Dropping it
   * here makes the next sign-in unnecessary. */
  function storedReturnUrl() {
    var raw;
    try {
      raw = localStorage.getItem("docubite:return-url");
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    var url;
    try {
      url = new URL(raw);
    } catch (e) {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    var loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    var pageIsLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (loopback && !pageIsLocal) {
      try { localStorage.removeItem("docubite:return-url"); } catch (e) { /* nothing to clear */ }
      return null;
    }
    return raw;
  }

  function addBackButton() {
    if (document.getElementById("db-back")) return;
    if (!document.body) return;
    var url = storedReturnUrl();
    // No usable target: a pill labelled "Back to DocuBite" that lands on the accounting app's own
    // home page is worse than no pill, so it is left off until a sign-in stores a real one.
    if (!url) return;
    var a = document.createElement("a");
    a.id = "db-back";
    a.href = url;
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
