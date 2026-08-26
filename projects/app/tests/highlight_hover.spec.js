const { test, expect } = require("@playwright/test");
const path = require("path");

test("should trigger HIGHLIGHT_WORD on mouseenter and CLEAR_HIGHLIGHT on mouseleave", async ({
  page,
}) => {
  const filePath =
    "file://" + path.resolve("projects/app/pages/sidepanel.html");

  let sentMessages = [];

  await page.addInitScript(() => {
    window.sentMessages = [];
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { dictionary: {} };
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (data, cb) => {
            if (cb) cb();
            return Promise.resolve();
          },
          onChanged: {
            addListener: () => {},
          },
        },
      },
      runtime: {
        getURL: (path) => path,
        getManifest: () => ({ version: "1.0.1" }),
        lastError: null,
      },
      tabs: {
        query: (query, cb) => {
          const tabs = [{ id: 123 }];
          if (cb) cb(tabs);
          return Promise.resolve(tabs);
        },
        sendMessage: (tabId, message, cb) => {
          window.sentMessages.push(message);
          if (cb) cb({ success: true });
        },
      },
      sidePanel: {
        setPanelBehavior: () => {},
      },
    };
  });

  await page.goto(filePath);
  await expect(page.locator("#extract-btn")).toBeVisible();

  // Add target word
  await page.fill("#manual-word", "テスト単語");
  await page.click("#add-word-btn");

  const row = page.locator(".word-row");
  await expect(row).toBeVisible();

  // Hover over row
  await row.hover();

  // Check sent message for HIGHLIGHT_WORD
  await page.waitForFunction(() => window.sentMessages.some(m => m.action === "HIGHLIGHT_WORD"));
  let messages = await page.evaluate(() => window.sentMessages);
  const highlightMsg = messages.find(m => m.action === "HIGHLIGHT_WORD");
  expect(highlightMsg).toBeTruthy();
  expect(highlightMsg.word).toBe("テスト単語");

  // Hover away
  await page.hover("#extract-btn");

  // Check sent message for CLEAR_HIGHLIGHT
  await page.waitForFunction(() => window.sentMessages.some(m => m.action === "CLEAR_HIGHLIGHT"));
  messages = await page.evaluate(() => window.sentMessages);
  const clearMsg = messages.find(m => m.action === "CLEAR_HIGHLIGHT");
  expect(clearMsg).toBeTruthy();
});
