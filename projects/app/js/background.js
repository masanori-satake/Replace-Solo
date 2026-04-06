/**
 * Replace-Solo Background Script
 * Manage side panel behavior and staggered script injection.
 */

function setGlobalPanelBehavior() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Replace-Solo: Failed to set panel behavior:', error));
}

// Set initial behavior
setGlobalPanelBehavior();

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
 * Initialize a single tab: configure the side panel and inject the content script.
 */
async function initializeTab(tab) {
  if (!tab || !tab.id) return;

  // 1. Configure the side panel for this tab
  await configureSidePanel(tab.id, tab.url);

  // 2. Staggered content script injection (only for supported URLs)
  if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
    try {
      const active = await isContentScriptActive(tab.id);
      if (!active) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['scripts/content.js']
        });
        console.log(`Replace-Solo: Content script injected into tab ${tab.id}`);
      } else {
        console.log(`Replace-Solo: Content script already active in tab ${tab.id}`);
      }
    } catch (error) {
      // Ignore errors for already injected or restricted pages
      console.log(`Replace-Solo: Skip injection for tab ${tab.id}:`, error.message);
    }
  }
}

/**
 * Perform staggered initialization of all existing tabs.
 * This prevents the browser from overloading during installation or startup.
 */
async function initializeAllTabs() {
  const tabs = await chrome.tabs.query({});

  // Prioritize active tabs
  const activeTabs = tabs.filter(t => t.active);
  const backgroundTabs = tabs.filter(t => !t.active);

  for (const tab of activeTabs) {
    await initializeTab(tab);
  }

  // Batch process background tabs to reduce IPC and CPU load
  const BATCH_SIZE = 5;
  const DELAY_MS = 300;

  for (let i = 0; i < backgroundTabs.length; i += BATCH_SIZE) {
    const batch = backgroundTabs.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(tab => initializeTab(tab)));
    if (i + BATCH_SIZE < backgroundTabs.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
}

// Handle extension installation or updates
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Replace-Solo: Extension installed/updated');
  setGlobalPanelBehavior();
  await initializeAllTabs();
});

// Handle browser startup (ensure tabs are ready)
chrome.runtime.onStartup.addListener(async () => {
  console.log('Replace-Solo: Browser started');
  await initializeAllTabs();
});

// Update side panel configuration when a tab's URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await configureSidePanel(tabId, changeInfo.url);
  }
});
