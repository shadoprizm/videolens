// Paste the approved Chrome Web Store listing URL here. Every install CTA,
// status message, and analytics destination will switch automatically.
var CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/plhohhmnkfidolnjnmdaenhdjkbbledl?utm_source=item-share-cb";
var EXTENSION_PREVIEW_URL = "https://app.videolens.io/?workflow=detailed&source=extension-launch";

window.va = window.va || function () {
  (window.vaq = window.vaq || []).push(arguments);
};

function chromiumBrowserName() {
  var brands = navigator.userAgentData && navigator.userAgentData.brands
    ? navigator.userAgentData.brands.map(function (brand) { return brand.brand; }).join(" ")
    : "";
  var userAgent = navigator.userAgent || "";
  if (/Microsoft Edge/i.test(brands) || /Edg\//.test(userAgent)) return "Microsoft Edge";
  if (/Opera/i.test(brands) || /OPR\//.test(userAgent)) return "Opera";
  if (/Brave/i.test(brands)) return "Brave";
  if (/Chromium|Google Chrome/i.test(brands) || /Chrome\//.test(userAgent)) return "Chrome";
  return "";
}

function configureExtensionLaunch() {
  var listingIsLive = Boolean(CHROME_WEB_STORE_URL);
  var browserName = chromiumBrowserName();
  var ctaUrl = listingIsLive ? CHROME_WEB_STORE_URL : EXTENSION_PREVIEW_URL;
  var ctaLabel = listingIsLive ? "Add to Chrome — Free" : "Try VideoLens free now →";
  var destination = listingIsLive ? "chrome-web-store" : "hosted-app-extension-preview";
  var status = listingIsLive ? "Available in the Chrome Web Store" : "Chrome Web Store review in progress";

  document.querySelectorAll("[data-extension-cta]").forEach(function (link) {
    link.href = ctaUrl;
    link.textContent = ctaLabel;
    link.dataset.track = listingIsLive ? "Add to Chrome" : "Try VideoLens free";
    link.dataset.destination = destination;
  });

  document.querySelectorAll("[data-extension-status]").forEach(function (element) {
    element.textContent = status;
  });

  document.querySelectorAll("[data-extension-heading]").forEach(function (element) {
    element.textContent = listingIsLive
      ? "Install in two clicks. Start with a free report."
      : "Start now. Install in two clicks when Google approves it.";
  });

  document.querySelectorAll("[data-extension-description]").forEach(function (element) {
    element.textContent = listingIsLive
      ? "Add VideoLens to Chrome, open a YouTube video, and create your first report. Free private mode stays free forever, and a free account includes one managed starter report."
      : "The complete report workflow is available in the browser today. When the listing goes live, this same button will take Chrome visitors straight to Add to Chrome.";
  });

  document.querySelectorAll("[data-browser-message]").forEach(function (element) {
    if (listingIsLive && browserName) {
      element.textContent = browserName + " detected — the Chrome Web Store will ask you to confirm the installation.";
    } else if (listingIsLive) {
      element.textContent = "Open this page in Chrome, Edge, Brave, or Opera to install the extension.";
    } else if (browserName) {
      element.textContent = browserName + " detected — try the complete workflow now while Google reviews the extension listing.";
    } else {
      element.textContent = "The browser app works now. Open this page in Chrome when the extension listing is approved.";
    }
  });
}

configureExtensionLaunch();

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
