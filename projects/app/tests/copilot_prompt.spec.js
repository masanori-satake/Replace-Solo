const { test, expect } = require("@playwright/test");
const path = require("path");

test("Copilot prompt generation should work correctly", async ({ page }) => {
  const filePath =
    "file://" + path.resolve("projects/app/pages/sidepanel.html");

  // Mock chrome API and clipboard
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = {
              dictionary: { 正しい: ["誤り1", "誤り2"], "": ["えー"] },
            };
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
        getManifest: () => ({ version: "1.1.0" }),
        lastError: null,
      },
      tabs: {
        query: (query, cb) => {
          const tabs = [{ id: 1, active: true }];
          if (cb) cb(tabs);
          return Promise.resolve(tabs);
        },
      },
      sidePanel: {
        setPanelBehavior: () => {},
      },
    };

    // Mock navigator.clipboard.writeText
    window.lastClipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text) => {
          window.lastClipboardText = text;
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });

  await page.goto(filePath);

  const insertBtn = page.locator("#btn-insert-copilot-prompt");
  await expect(insertBtn).toBeVisible();

  // Click the button
  await insertBtn.click();

  // Verify visual feedback (icon change to check mark)
  const checkMarkPath = "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z";
  const currentPath = await insertBtn.locator("path").getAttribute("d");
  expect(currentPath).toBe(checkMarkPath);

  // Verify clipboard content
  const clipboardText = await page.evaluate(() => window.lastClipboardText);
  expect(clipboardText).toBeTruthy();
  expect(clipboardText).toContain("> 【AIメモ作成用ガイドライン】");
  expect(clipboardText).toContain("1. 不要語句（フィラー）の除外");
  expect(clipboardText).toContain("- 対象: `えー`");
  expect(clipboardText).toContain("2. 用語の統一・表記補正");
  expect(clipboardText).toContain(
    "- `誤り1`, `誤り2` → 「正しい」に統一",
  );
});
