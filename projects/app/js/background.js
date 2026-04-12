/**
 * Replace-Solo Background Script
 * Manage side panel behavior and action button state based on the URL.
 */

/**
 * Microsoft Loopのページが置換をサポートしているか判定する
 */
function isSupportedLoopPage(urlStr) {
  if (!urlStr) return false;
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;
    // Loopのドメイン判定
    const isLoop = hostname === 'loop.microsoft.com' || hostname.endsWith('.loop.microsoft.com') ||
                   hostname === 'loop.cloud.microsoft' || hostname.endsWith('.loop.cloud.microsoft');

    if (!isLoop) return false;

    // Loopの場合、/p/（ページ）から始まるURLのみサポート
    return url.pathname.startsWith('/p/');
  } catch (e) {
    return false;
  }
}

/**
 * タブの状態（サイドパネルの有効化とアクションボタンの状態）を更新する
 */
async function updateTabState(tabId, url) {
  if (!tabId) return;

  const isSupported = isSupportedLoopPage(url);

  try {
    // サイドパネルの有効/無効を設定
    // enabled: false に設定すると、そのタブでサイドパネルが開いていた場合は自動的に閉じられる
    // 有効化する際は明示的に path を指定することで、グローバルな無効化設定を確実に上書きする
    const options = {
      tabId: tabId,
      enabled: isSupported
    };

    if (isSupported) {
      options.path = '/pages/sidepanel.html';
    }

    await chrome.sidePanel.setOptions(options);

    // アクションボタンの有効/無効を設定（グレーアウト制御）
    // アイコンとツールチップ（タイトル）も明示的に切り替える
    if (isSupported) {
      // アイコンの設定を先に行い、その後に有効化する
      await chrome.action.setIcon({
        tabId: tabId,
        path: {
          "16": "/assets/icons/icon16.png",
          "32": "/assets/icons/icon32.png",
          "48": "/assets/icons/icon48.png",
          "128": "/assets/icons/icon128.png"
        }
      });
      await chrome.action.setTitle({ tabId: tabId, title: 'サイドパネルを開く' });
      await chrome.action.enable(tabId);
    } else {
      await chrome.action.setIcon({
        tabId: tabId,
        path: {
          "16": "/assets/icons/icon16_gray.png",
          "32": "/assets/icons/icon32_gray.png",
          "48": "/assets/icons/icon48_gray.png",
          "128": "/assets/icons/icon128_gray.png"
        }
      });
      await chrome.action.setTitle({ tabId: tabId, title: 'Replace-Solo (サポートされていないページ)' });
      await chrome.action.disable(tabId);
    }
  } catch (error) {
    // 特殊なタブ（chrome:// や設定ページなど）ではAPIが制限される場合があるため
    console.debug(`Replace-Solo: Failed to update tab state for ${tabId}:`, error);
  }
}

/**
 * Global side panel behavior is managed by the action button.
 * Note: openPanelOnActionClick: true ensures the side panel opens when the action button is clicked.
 * This must be called at the top level to persist across service worker restarts.
 */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Replace-Solo: Failed to set panel behavior:', error));

/**
 * Initialize side panel behavior and update all existing tabs.
 */
async function initializeSidePanel() {
  try {
    // デフォルトではサイドパネルとアクションボタンを無効化（Loop専用のため）
    await chrome.sidePanel.setOptions({ enabled: false });
    await chrome.action.disable();
  } catch (error) {
    console.debug('Replace-Solo: Failed to set default side panel options:', error);
  }

  // 初回起動時やリロード時に全タブの状態を更新する
  try {
    const tabs = await chrome.tabs.query({});
    // 各タブの状態更新を並列で実行し、個別のエラーが他に影響しないようにする
    await Promise.allSettled(tabs.map(tab => {
      if (tab.id) {
        return updateTabState(tab.id, tab.url || tab.pendingUrl);
      }
      return Promise.resolve();
    }));
  } catch (error) {
    console.debug('Replace-Solo: Failed to query tabs during initialization:', error);
  }
}

/**
 * Handle extension installation or updates.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Replace-Solo: Extension installed/updated');
  initializeSidePanel();
});

/**
 * Handle browser startup.
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('Replace-Solo: Browser started');
  initializeSidePanel();
});

/**
 * タブのURL更新を監視（SPA遷移や通常のページ遷移、戻る・進むに対応）
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // URLが変わった場合、または読み込みが完了した場合に状態を更新
  if (changeInfo.url || changeInfo.status === 'complete') {
    try {
      await updateTabState(tabId, tab.url || tab.pendingUrl);
    } catch (error) {
      console.debug(`Replace-Solo: Failed to handle onUpdated for tab ${tabId}:`, error);
    }
  }
});

/**
 * タブの切り替えを監視
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab) {
      await updateTabState(activeInfo.tabId, tab.url || tab.pendingUrl);
    }
  } catch (error) {
    // タブが存在しない場合のエラー（No tab with id）をキャッチして無視する
    console.debug('Replace-Solo: Failed to handle tab activation:', error);
  }
});
