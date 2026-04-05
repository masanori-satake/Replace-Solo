chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// タブ切り替え時にサイドパネルを更新またはリセットするための通知
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.runtime.sendMessage({ action: 'TAB_CHANGED', tabId: activeInfo.tabId });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PAGE_TEXT_READY') {
    // ページテキストが準備完了したことをサイドパネルに通知
    chrome.runtime.sendMessage({ action: 'ANALYZE_TEXT', text: request.text });
  }
});
