chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 1つのタブを初期化する関数（コンテンツスクリプト注入のみ）
async function initializeTab(tab) {
  if (!tab || !tab.id) return;

  // コンテンツスクリプトを注入（特殊なページや読み込み中以外のページを対象）
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

// インストール/アップデート時に既存の全タブに対して段階的にコンテンツスクリプトを注入
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});

  // 1. まず現在のアクティブタブを最優先で初期化
  const activeTabs = tabs.filter(t => t.active);
  const otherTabs = tabs.filter(t => !t.active);

  for (const activeTab of activeTabs) {
    await initializeTab(activeTab);
  }

  // 2. 残りのタブをバッチ処理で段階的に初期化して負荷を軽減
  const BATCH_SIZE = 5;
  const DELAY_MS = 200;

  for (let i = 0; i < otherTabs.length; i += BATCH_SIZE) {
    const batch = otherTabs.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(tab => initializeTab(tab)));

    // 次のバッチの前に少し待機
    if (i + BATCH_SIZE < otherTabs.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
});
