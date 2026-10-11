// Store choices stay explicit and identical in every browser. Track clicks only.
window.va = window.va || function () {
  (window.vaq = window.vaq || []).push(arguments);
};
// Register before the deferred insights script. Auth codes, pairing nonces,
// checkout IDs and report hashes must never enter anonymous analytics.
window.va("beforeSend", function (event) {
  try {
    var url = new URL(event.url, window.location.origin);
    var publicPaths = ["/", "/account", "/chrome", "/privacy", "/ai-video-analyzer", "/youtube-video-analyzer", "/screen-recording-analyzer", "/session-replay-analyzer", "/loom-video-analyzer", "/meeting-video-analyzer", "/video-privacy-analyzer", "/video-analysis-mcp"];
    if (!publicPaths.includes(url.pathname.replace(/\/$/, "") || "/")) return null;
    url.search = "";
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
