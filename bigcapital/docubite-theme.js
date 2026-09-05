/* DocuBite skin for the Bigcapital webapp, injected by nginx (see nginx.conf sub_filter).
 * Keeps the app on the light Blueprint theme and adds a "Back to DocuBite" pill that returns
 * to the workspace that opened accounting (URL handed over by auth-bridge.html). */
(function () {
  function lighten() {
    document.body.classList.remove("bp4-dark");
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
    lighten();
    addBackButton();
    // The SPA re-renders and Blueprint may re-add the dark class; keep stripping it.
    new MutationObserver(lighten).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
