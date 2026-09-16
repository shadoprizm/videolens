interface FirefoxSidebarAction {
  open(): Promise<void>;
}

const firefoxApi = chrome as typeof chrome & {
  sidebarAction: FirefoxSidebarAction;
};

// Firefox exposes the sidebar through sidebarAction rather than Chrome's
// sidePanel API. Opening it from this user-action handler preserves activeTab.
chrome.action.onClicked.addListener(() => {
  void firefoxApi.sidebarAction.open().catch((error) => console.error("sidebar open:", error));
});
