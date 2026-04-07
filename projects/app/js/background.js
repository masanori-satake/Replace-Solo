/**
 * Replace-Solo Background Script
 * Manage side panel behavior and staggered script injection.
 */

/**
 * Global side panel behavior is managed by the action button.
 * Note: openPanelOnActionClick: true ensures the side panel opens when the action button is clicked.
 */
function initializeSidePanel() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Replace-Solo: Failed to set panel behavior:', error));
}

initializeSidePanel();

/**
 * Handle extension installation or updates.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Replace-Solo: Extension installed/updated');
  initializeSidePanel();
  // Avoid bulk injection to prevent context duplication.
  // Scripts are injected on-demand by sidepanel.js when needed.
});

/**
 * Handle browser startup.
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('Replace-Solo: Browser started');
  initializeSidePanel();
});
