const { test, expect } = require("@playwright/test");
const path = require("path");

test("should safely handle non-string items in dictionary origins during cache updates without throwing errors", async ({
  page,
}) => {
  const filePath =
    "file://" + path.resolve("projects/app/pages/sidepanel.html");

  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = {
              dictionary: {
                "置換後": ["置換前", 12345, null, { key: "val" }],
              },
              highlightEnabled: false,
            };
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (data, cb) => {
            if (cb) cb(data);
            return Promise.resolve();
          },
        },
      },
      runtime: {
        getURL: (path) => path,
        getManifest: () => ({ version: "1.2.1" }),
        lastError: null,
      },
      tabs: {
        query: (query, cb) => {
          const tabs = [{ id: 123 }];
          if (cb) cb(tabs);
          return Promise.resolve(tabs);
        },
      },
      sidePanel: {
        setPanelBehavior: () => {},
      },
    };
  });

  await page.goto(filePath);
  await expect(page.locator("#extract-btn")).toBeVisible();
});
