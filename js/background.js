chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// タブ切り替え時にサイドパネルを更新またはリセットするための通知
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.runtime.sendMessage({ action: 'TAB_CHANGED', tabId: activeInfo.tabId });
});
