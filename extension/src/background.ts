// Clicking the toolbar icon opens the side panel and grants activeTab on the
// current tab, which is what lets the panel inject the capture script there.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error("sidePanel behavior:", e));
