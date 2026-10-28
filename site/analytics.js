// Store choices stay explicit and identical in every browser. Track clicks only.
window.va = window.va || function () {
  (window.vaq = window.vaq || []).push(arguments);
};
// Register before the deferred insights script. Auth codes, pairing nonces,
// checkout IDs and report hashes must never enter anonymous analytics, so the
// query string is rebuilt from an allowlist of campaign parameters only.
var CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
window.va("beforeSend", function (event) {
  try {
    var url = new URL(event.url, window.location.origin);
    var publicPaths = ["/", "/account", "/chrome", "/privacy", "/ai-video-analyzer", "/youtube-video-analyzer", "/screen-recording-analyzer", "/session-replay-analyzer", "/loom-video-analyzer", "/meeting-video-analyzer", "/video-privacy-analyzer", "/video-analysis-mcp"];
    if (!publicPaths.includes(url.pathname.replace(/\/$/, "") || "/")) return null;
    var kept = new URLSearchParams();
    CAMPAIGN_PARAMS.forEach(function (name) {
      var value = url.searchParams.get(name);
      // Campaign tags are short labels; anything longer is not a tag we set.
      if (value && value.length <= 100) kept.set(name, value);
    });
    url.search = kept.toString();
    url.hash = "";
    return Object.assign({}, event, { url: url.toString() });
  } catch (_) { return null; }
});

document.addEventListener("click", function (event) {
  var link = event.target.closest("a[data-track]");
  if (!link) return;
  window.va("event", {
    name: link.dataset.track,
    data: {
      destination: link.dataset.destination || "unknown",
      page: window.location.pathname
    }
  });
});
