chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 各タブに対して固有のサイドパネルを設定する
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.sidePanel.setOptions({
      tabId: tabId,
      path: 'sidepanel.html',
      enabled: true
    }).catch((error) => console.error(error));
  }
});

// インストール時に既存の全タブに対して固有のサイドパネルを設定する
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        chrome.sidePanel.setOptions({
          tabId: tab.id,
          path: 'sidepanel.html',
          enabled: true
        }).catch((error) => console.error(error));
      }
    });
  });
});
