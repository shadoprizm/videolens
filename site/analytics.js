window.va = window.va || function () {
  (window.vaq = window.vaq || []).push(arguments);
};

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
