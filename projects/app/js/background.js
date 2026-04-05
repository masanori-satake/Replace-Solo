chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// タブ個別のサイドパネル設定を行う関数
async function setTabSpecificSidePanel(tabId, url) {
  if (!url || url.startsWith('chrome://')) return;

  try {
    await chrome.sidePanel.setOptions({
      tabId: tabId,
      path: `pages/sidepanel.html?tabId=${tabId}`,
      enabled: true
    });
    console.log(`Side panel set for tab ${tabId}`);
  } catch (error) {
    console.error(`Error setting side panel for tab ${tabId}:`, error);
  }
}

// タブ更新時にサイドパネルを設定
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    setTabSpecificSidePanel(tabId, tab.url);
  }
});

// インストール/アップデート時に既存の全タブに対して設定
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    setTabSpecificSidePanel(tab.id, tab.url);
  }
});
