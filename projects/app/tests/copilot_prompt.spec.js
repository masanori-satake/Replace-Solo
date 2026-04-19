const { test, expect } = require('@playwright/test');
const path = require('path');

test('Copilot prompt generation should work correctly', async ({ page }) => {
  const filePath = 'file://' + path.resolve('projects/app/pages/sidepanel.html');

  // Mock chrome API and clipboard
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { dictionary: { "正しい": ["誤り1", "誤り2"], "": ["えー"] } };
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (data, cb) => {
            if (cb) cb();
            return Promise.resolve();
          },
          onChanged: {
            addListener: () => {}
          }
        }
      },
      runtime: {
        getURL: (path) => path,
        getManifest: () => ({ version: '1.0.0' }),
        lastError: null
      },
      tabs: {
        query: (query, cb) => {
            if (cb) cb([]);
            return Promise.resolve([]);
        }
      },
      sidePanel: {
        setPanelBehavior: () => {}
      }
    };

    // Mock navigator.clipboard.write
    window.lastClipboardData = [];
    window.ClipboardItem = class ClipboardItem {
      constructor(data) {
        this.data = data;
        window.lastClipboardData.push(data);
      }
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: async (items) => {
          return Promise.resolve();
        }
      },
      configurable: true
    });
  });

  await page.goto(filePath);

  const copyBtn = page.locator('#copy-copilot-prompt-btn');
  await expect(copyBtn).toBeVisible();

  // Click the button
  await copyBtn.click();

  // Verify visual feedback (icon change to check mark)
  const checkMarkPath = "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z";
  const currentPath = await copyBtn.locator('path').getAttribute('d');
  expect(currentPath).toBe(checkMarkPath);

  // Verify clipboard content
  const clipboardContent = await page.evaluate(async () => {
    const items = window.lastClipboardData;
    if (items.length > 0) {
      const data = items[0];
      if (data['text/plain']) {
        return await data['text/plain'].text();
      }
    }
    return "";
  });

  expect(clipboardContent).toContain('💡 AI補正データ (@facilitator 用)');
  expect(clipboardContent).toContain('"正しい": [');
  expect(clipboardContent).toContain('"誤り1"');
  expect(clipboardContent).toContain('（空キーの語句は削除）');
  expect(clipboardContent).not.toContain('<details>');
  expect(clipboardContent).toContain('```json');
});
