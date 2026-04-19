const { test, expect } = require("@playwright/test");
const path = require("path");

test("should not automatically check dictionary registration for manually added words", async ({
  page,
}) => {
  // Load the sidepanel page
  const filePath =
    "file://" + path.resolve("projects/app/pages/sidepanel.html");

  // Mock chrome API
  await page.addInitScript(() => {
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
        getManifest: () => ({ version: "0.14.0" }),
        lastError: null,
      },
      tabs: {
        query: (query, cb) => {
          if (cb) cb([]);
          return Promise.resolve([]);
        },
      },
      sidePanel: {
        setPanelBehavior: () => {},
      },
    };
  });

  await page.goto(filePath);

  // Wait for the UI to be ready.
  // We wait for the "Extract" button to be attached/visible as it's a primary UI element.
  await expect(page.locator("#extract-btn")).toBeVisible();

  // Input a word
  await page.fill("#manual-word", "テスト単語");
  await page.click("#add-word-btn");

  // Verify the row is added
  const row = page.locator(".word-row");
  await expect(row).toBeVisible();

  // Check the dictionary registration checkbox
  const dictCheck = row.locator(".dict-check");

  // We expect it NOT to be checked by default for manually added words
  // Use state check that works even if the element is visually hidden (but present in DOM)
  const isChecked = await dictCheck.evaluate((el) => el.checked);
  expect(isChecked).toBe(false);
});
