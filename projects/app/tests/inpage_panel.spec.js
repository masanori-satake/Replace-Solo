const { test, expect } = require("@playwright/test");
const path = require("path");

test("inpage panel host should appear on /p/ pages and disappear on other pages", async ({
  page,
}) => {
  // Serve a mock Loop page (no real network access)
  await page.route("https://loop.microsoft.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!DOCTYPE html>
        <html>
          <head><title>Loop Mock Page</title></head>
          <body>
            <div contenteditable="true"><p>テスト本文です。</p></div>
          </body>
        </html>`,
    });
  });

  // Stub the chrome.* APIs that inpage.js touches at load time
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
        },
      },
      runtime: {
        getURL: (p) => `chrome-extension://test/${p}`,
        onMessage: { addListener: () => {} },
      },
    };
  });

  await page.goto("https://loop.microsoft.com/p/test-page");

  // Inject scripts in the same order as manifest content_scripts
  await page.addScriptTag({
    path: path.resolve("projects/app/scripts/content.js"),
  });
  await page.addScriptTag({
    path: path.resolve("projects/app/scripts/inpage.js"),
  });

  // The floating button host should be attached on a /p/ page
  await expect(page.locator("#replace-solo-inpage-host")).toBeAttached({
    timeout: 3000,
  });

  // SPA navigation away from /p/ should remove the UI (1s polling interval)
  await page.evaluate(() => {
    history.pushState({}, "", "/home");
  });
  await expect(page.locator("#replace-solo-inpage-host")).toHaveCount(0, {
    timeout: 3000,
  });

  // Navigating back to a /p/ page should show it again
  await page.evaluate(() => {
    history.pushState({}, "", "/p/test-page");
  });
  await expect(page.locator("#replace-solo-inpage-host")).toBeAttached({
    timeout: 3000,
  });
});
