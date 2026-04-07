/**
 * Replace-Solo Background Script
 * Manage side panel behavior.
 */

/**
 * Initialize side panel behavior.
 */
function initializeSidePanel() {
  // Global side panel behavior is managed by the action button.
  // Note: openPanelOnActionClick: true ensures the side panel opens when the action button is clicked.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Replace-Solo: Failed to set panel behavior:', error));

  // Ensure the side panel is enabled by default for all tabs.
  chrome.sidePanel
    .setOptions({ enabled: true })
    .catch((error) => console.error('Replace-Solo: Failed to set global options:', error));
}

// Execute at top-level to ensure initialization whenever the service worker starts.
initializeSidePanel();

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
});
