const { test, expect } = require("@playwright/test");
const path = require("path");

// Copilot Pages（copilot.cloud.microsoft の /chat/pages/…）対応の確認。
// 実ページにはアクセスせず、page.route でモックを返す。

function stubChromeApis(page) {
  return page.addInitScript(() => {
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
}

test("inpage panel host should appear on Copilot Pages and disappear on other Copilot pages", async ({
  page,
}) => {
  await page.route("https://copilot.cloud.microsoft/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!DOCTYPE html>
        <html>
          <head><title>Copilot Mock Page</title></head>
          <body>
            <div contenteditable="true"><p>テスト本文です。</p></div>
          </body>
        </html>`,
    });
  });

  await stubChromeApis(page);

  await page.goto("https://copilot.cloud.microsoft/chat/pages/test-page");

  // Inject scripts in the same order as manifest content_scripts
  await page.addScriptTag({
    path: path.resolve("projects/app/scripts/content.js"),
  });
  await page.addScriptTag({
    path: path.resolve("projects/app/scripts/inpage.js"),
  });

  // The floating button host should be attached on a /chat/pages/ page
  await expect(page.locator("#replace-solo-inpage-host")).toBeAttached({
    timeout: 3000,
  });

  // SPA navigation away from /chat/pages/ should remove the UI (1s polling interval)
  await page.evaluate(() => {
    history.pushState({}, "", "/chat");
  });
  await expect(page.locator("#replace-solo-inpage-host")).toHaveCount(0, {
    timeout: 3000,
  });

  // Navigating back to a /chat/pages/ page should show it again
  await page.evaluate(() => {
    history.pushState({}, "", "/chat/pages/test-page");
  });
  await expect(page.locator("#replace-solo-inpage-host")).toBeAttached({
    timeout: 3000,
  });
});

test("getTargetRoot should return the scriptor canvas on Copilot Pages hosts", async ({
  page,
}) => {
  const mockBody = `<!DOCTYPE html>
    <html>
      <head><title>Copilot Pages Mock</title></head>
      <body>
        <div id="chat-area"><p>チャット側のテキスト</p></div>
        <div class="scriptor-canvas scriptor-canvas-grid-layout">
          <div contenteditable="true"><p>ページ本文です。</p></div>
        </div>
      </body>
    </html>`;
  for (const host of ["copilot.cloud.microsoft", "m365.cloud.microsoft"]) {
    await page.route(`https://${host}/**`, async (route) => {
      await route.fulfill({ contentType: "text/html", body: mockBody });
    });
  }

  for (const host of ["copilot.cloud.microsoft", "m365.cloud.microsoft"]) {
    await page.goto(`https://${host}/chat/pages/test-page`);
    await page.addScriptTag({
      path: path.resolve("projects/app/scripts/content.js"),
    });

    const rootClass = await page.evaluate(() => {
      const root = getTargetRoot();
      return root === document.body ? "BODY" : root.className;
    });
    expect(rootClass).toContain("scriptor-canvas");
  }
});
