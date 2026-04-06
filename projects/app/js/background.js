/**
 * Replace-Solo Background Script
 * Manage side panel behavior and staggered script injection.
 */

/**
 * Global side panel behavior is managed by the action button.
 * Note: openPanelOnActionClick: true works but can be unstable if not combined with onClicked.
 */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Replace-Solo: Failed to set panel behavior:', error));

/**
 * Ensure the side panel opens when the action button is clicked.
 */
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch((error) => console.error(error));
});

/**
 * Enable/disable the side panel based on the tab's URL.
 */
async function configureSidePanel(tabId, url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
    try {
      await chrome.sidePanel.setOptions({
        tabId: tabId,
        enabled: false
      });
    } catch (e) {
      // Tab might be closed
    }
    return;
  }

  try {
    // Note: To share a single side panel instance across all tabs (global state),
    // we must NOT provide the 'path' property here. It uses 'default_path' from manifest.
    await chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: true
    });
  } catch (e) {
    // Tab might be closed or restricted
  }
}

/**
 * Check if the content script is already active in the tab.
 */
async function isContentScriptActive(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    return response && response.pong === true;
  } catch (e) {
    return false;
  }
}

/**
 * Handle extension installation or updates.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Replace-Solo: Extension installed/updated');
  // Avoid bulk injection to prevent context duplication.
  // Scripts are injected on-demand by sidepanel.js when needed.
});

/**
 * Handle browser startup.
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('Replace-Solo: Browser started');
});

// Update side panel configuration when a tab's URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await configureSidePanel(tabId, changeInfo.url);
  }
});
