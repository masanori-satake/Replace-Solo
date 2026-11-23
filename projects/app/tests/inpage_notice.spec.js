const { test, expect } = require("@playwright/test");
const path = require("path");

const NOTICE_KEY = "notice_inpage_dismissed_v1_13_0";

// Load the sidepanel page with a stateful chrome.storage stub whose
// contents survive page reloads (backed by Node-side functions).
async function loadSidepanel(page, store) {
  await page.exposeFunction("__rsStoreGetAll", () => ({ ...store }));
  await page.exposeFunction("__rsStoreSet", (obj) => {
    Object.assign(store, obj);
  });

  await page.addInitScript(async () => {
    const pick = (all, keys) => {
      if (keys == null) return all;
      if (typeof keys === "string") {
        return keys in all ? { [keys]: all[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) if (k in all) out[k] = all[k];
        return out;
      }
      return all;
    };
    window.chrome = {
      storage: {
        local: {
          get: async (keys) => pick(await window.__rsStoreGetAll(), keys),
          set: async (data) => {
            await window.__rsStoreSet(data);
          },
          onChanged: { addListener: () => {} },
        },
      },
      runtime: {
        getURL: (p) => p,
        getManifest: () => ({ version: "1.13.0" }),
        lastError: null,
      },
      tabs: {
        query: (query, cb) => {
          if (cb) cb([]);
          return Promise.resolve([]);
        },
      },
      sidePanel: { setPanelBehavior: () => {} },
    };
  });

  const filePath =
    "file://" + path.resolve("projects/app/pages/sidepanel.html");
  await page.goto(filePath);
  await expect(page.locator("#extract-btn")).toBeVisible();
  return filePath;
}

test("notice should show on first open and not reappear after dismiss with checkbox", async ({
  page,
}) => {
  const store = {};
  const filePath = await loadSidepanel(page, store);

  // Shown on first open
  await expect(page.locator("#inpage-notice")).toBeVisible();

  // Check "もう表示しない" and close
  await page.check("#inpage-notice-dismiss");
  await page.click("#inpage-notice-close-btn");
  await expect(page.locator("#inpage-notice")).toBeHidden();
  expect(store[NOTICE_KEY]).toBe(true);

  // Reopening the panel (reload) should not show it again
  await page.reload();
  await expect(page.locator("#extract-btn")).toBeVisible();
  await expect(page.locator("#inpage-notice")).toBeHidden();
  expect(filePath).toContain("sidepanel.html");
});

test("notice should reappear on next open when closed without the checkbox", async ({
  page,
}) => {
  const store = {};
  await loadSidepanel(page, store);

  await expect(page.locator("#inpage-notice")).toBeVisible();

  // Close without checking "もう表示しない"
  await page.click("#inpage-notice-close-btn");
  await expect(page.locator("#inpage-notice")).toBeHidden();
  expect(store[NOTICE_KEY]).toBeUndefined();

  // Reopening the panel should show it again
  await page.reload();
  await expect(page.locator("#extract-btn")).toBeVisible();
  await expect(page.locator("#inpage-notice")).toBeVisible();
});
