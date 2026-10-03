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

    // Mock navigator.clipboard.write
    window.lastClipboardData = [];
    window.ClipboardItem = class ClipboardItem {
      constructor(data) {
        this.data = data;
        window.lastClipboardData.push(data);
      }
    };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: async (items) => {
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });

  await page.goto(filePath);

  const insertBtn = page.locator("#btn-insert-copilot-prompt");
  await expect(insertBtn).toBeVisible();

  // Mock message listener for content script insertion
  let lastSentMessage = null;
  await page.evaluate(() => {
    window.chrome.tabs.sendMessage = (tabId, message, cb) => {
      window.lastMessage = message;
      if (cb) cb({ success: true });
      return Promise.resolve({ success: true });
    };
  });

  // Click the button
  await insertBtn.click();

  // Verify visual feedback (icon change to check mark)
  const checkMarkPath = "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z";
  const currentPath = await insertBtn.locator("path").getAttribute("d");
  expect(currentPath).toBe(checkMarkPath);

  // Verify message content
  const sentMessage = await page.evaluate(() => window.lastMessage);
  expect(sentMessage).toBeTruthy();
  expect(sentMessage.action).toBe("INSERT_COPILOT_PROMPT_TOGGLE");
  expect(sentMessage.promptText).toContain(
    "🔽 【Facilitatorへの指示・用語定義】",
  );
  expect(sentMessage.promptText).toContain("言い淀み（「えー」など）");
  expect(sentMessage.promptText).toContain("・「誤り1」「誤り2」 → 「正しい」");
  expect(sentMessage.markdownPrompt).toContain(
    "> 🔽 【Facilitatorへの指示・用語定義】",
  );
});
