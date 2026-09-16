const { test, expect } = require("@playwright/test");
const path = require("path");

test("should add manually added target words to the top of the table and handle IME composition", async ({
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

  // Stub scrollTo on table-container
  await page.evaluate(() => {
    window.scrollToCalls = [];
    const container = document.querySelector(".table-container");
    if (container) {
      container.scrollTo = (options) => {
        window.scrollToCalls.push(options);
      };
    }
  });

  // Test IME composition Enter event (should NOT add word)
  await page.fill("#manual-word", "変換中の単語");
  await page.dispatchEvent("#manual-word", "keydown", {
    key: "Enter",
    isComposing: true,
  });

  const originsComposing = page.locator(".word-origin");
  await expect(originsComposing).toHaveCount(0);

  // Add first word via button click
  await page.fill("#manual-word", "最初の単語");
  await page.click("#add-word-btn");

  // Verify scrollTo stub calls
  await page.waitForFunction(() => window.scrollToCalls.length > 0);
  const calls = await page.evaluate(() => window.scrollToCalls);
  expect(calls[0]).toEqual({ top: 0, behavior: "smooth" });

  // Add second word using non-composing Enter key
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

  // Spy/stub scrollIntoView on the row before the duplicate add attempt
  await page.evaluate(() => {
    window.scrollIntoViewCalls = [];
    const rows = document.querySelectorAll(".word-row");
    rows.forEach((row) => {
      row.scrollIntoView = (options) => {
        window.scrollIntoViewCalls.push(options);
      };
    });
  });

  // Try adding duplicate word
  await page.fill("#manual-word", "重複テスト");
  await page.click("#add-word-btn");

  // Count should still be 1
  await expect(origins).toHaveCount(1);
  await expect(page.locator("#manual-word")).toHaveValue("");

  // Assert scrollIntoView was called with { behavior: "smooth", block: "nearest" }
  const scrollCalls = await page.evaluate(() => window.scrollIntoViewCalls);
  expect(scrollCalls).toHaveLength(1);
  expect(scrollCalls[0]).toEqual({ behavior: "smooth", block: "nearest" });
});
