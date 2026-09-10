const { test, expect } = require("@playwright/test");
const path = require("path");

test("should safely handle prototype property names as target or origin words without throwing errors", async ({
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
                toString: ["hasOwnProperty", "valueOf"],
                constructor: ["__proto__"],
              },
              highlightEnabled: false,
            };
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (data, cb) => {
            if (cb) cb();
            return Promise.resolve();
          },
        },
      },
      runtime: {
        getURL: (path) => path,
        getManifest: () => ({ version: "1.1.6" }),
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

  // 手動でプロトタイプ名と同名の単語を追加
  await page.fill("#manual-word", "__proto__");
  await page.click("#add-word-btn");

  const row = page.locator(".word-row");
  await expect(row).toBeVisible();

  const originText = await row.locator(".word-origin").textContent();
  const replaceInput = row.locator(".replace-input");
  const replaceValue = await replaceInput.inputValue();

  expect(originText).toBe("__proto__");
  expect(replaceValue).toBe("constructor");
});
