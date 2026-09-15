// Clicking the toolbar icon opens the side panel and grants activeTab on the
// current tab, which lets the panel inject the capture script there.
function configureSidePanel(): void {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("sidePanel behavior:", error));
}

chrome.runtime.onInstalled.addListener(configureSidePanel);
chrome.runtime.onStartup.addListener(configureSidePanel);
configureSidePanel();
