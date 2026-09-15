const { test, expect } = require("@playwright/test");
const path = require("path");

test("should add manually added target words to the top of the table", async ({
  page,
}) => {
  const filePath =
    "file://" + path.resolve("projects/app/pages/sidepanel.html");

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
        getURL: (p) => p,
        getManifest: () => ({ version: "1.1.0" }),
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
  await expect(page.locator("#extract-btn")).toBeVisible();

  // Add first word
  await page.fill("#manual-word", "最初の単語");
  await page.click("#add-word-btn");

  // Add second word using Enter key
  await page.fill("#manual-word", "２番目の単語");
  await page.press("#manual-word", "Enter");

  // Get origins in table order
  const origins = page.locator(".word-origin");
  await expect(origins).toHaveCount(2);

  const firstOrigin = await origins.nth(0).textContent();
  const secondOrigin = await origins.nth(1).textContent();

  expect(firstOrigin).toBe("２番目の単語");
  expect(secondOrigin).toBe("最初の単語");
});

test("should handle duplicate manual word additions and trigger scrolling", async ({
  page,
}) => {
  const filePath =
    "file://" + path.resolve("projects/app/pages/sidepanel.html");

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
        getURL: (p) => p,
        getManifest: () => ({ version: "1.1.0" }),
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

  // Add word
  await page.fill("#manual-word", "重複テスト");
  await page.click("#add-word-btn");

  const origins = page.locator(".word-origin");
  await expect(origins).toHaveCount(1);

  await origins.nth(0).evaluate((origin) => {
    const row = origin.closest(".word-row");
    window.scrollIntoViewCalls = [];
    row.scrollIntoView = (options) => {
      window.scrollIntoViewCalls.push(options);
    };
  });

  // Try adding duplicate word
  await page.fill("#manual-word", "重複テスト");
  await page.click("#add-word-btn");

  // Count should still be 1
  await expect(origins).toHaveCount(1);
  await expect(page.locator("#manual-word")).toHaveValue("");
  await expect
    .poll(() => page.evaluate(() => window.scrollIntoViewCalls))
    .toEqual([{ behavior: "smooth", block: "nearest" }]);
});
