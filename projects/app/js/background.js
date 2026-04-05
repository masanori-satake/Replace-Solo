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
    await setTabSpecificSidePanel(tab.id, tab.url);

    // コンテンツスクリプトを既存のタブに注入
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['scripts/content.js']
        });
        console.log(`Content script injected into tab ${tab.id}`);
      } catch (error) {
        // すでに注入されている場合や、特殊なページではエラーになる可能性があるため無視
        console.log(`Could not inject content script into tab ${tab.id}:`, error);
      }
    }
  }
});
