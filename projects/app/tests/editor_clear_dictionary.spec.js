const { test, expect } = require("@playwright/test");
const path = require("path");

test("editor clear dictionary button should be placed in header actions, show confirm dialog, and clear dictionary on OK", async ({
  page,
}) => {
  const filePath = "file://" + path.resolve("projects/app/pages/editor.html");

  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = {
              dictionary: {
                customTarget: ["customOrigin"],
                "": ["えー"],
              },
            };
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (data, cb) => {
            if (data.dictionary) {
              window.__lastSavedDictionary = data.dictionary;
            }
            if (cb) cb();
            return Promise.resolve();
          },
        },
        onChanged: {
          addListener: () => {},
        },
      },
      runtime: {
        getURL: (p) => p,
        lastError: null,
      },
    };
  });

  await page.goto(filePath);

  // 1. Check placement in header actions
  const headerActionsButtons = page.locator(".header-actions button");
  await expect(headerActionsButtons).toHaveCount(2);

  const firstBtn = headerActionsButtons.nth(0);
  const secondBtn = headerActionsButtons.nth(1);

  await expect(firstBtn).toHaveId("add-row-btn");
  await expect(secondBtn).toHaveId("clear-dictionary");

  // 2. Click Clear button and check confirm dialog
  const confirmDialog = page.locator("#confirm-dialog");
  await expect(confirmDialog).not.toBeVisible();

  await secondBtn.click();
  await expect(confirmDialog).toBeVisible();
  await expect(page.locator("#confirm-message")).toHaveText(
    "辞書をクリアして初期状態に戻しますか？",
  );

  // 3. Cancel confirmation
  await page.click("#confirm-cancel");
  await expect(confirmDialog).not.toBeVisible();
  await expect(
    page.locator(".tag-pill", { hasText: "customOrigin" }),
  ).toBeVisible();

  // 4. Confirm clearing dictionary
  await secondBtn.click();
  await expect(confirmDialog).toBeVisible();
  await page.click("#confirm-ok");
  await expect(confirmDialog).not.toBeVisible();

  // Custom dictionary item should be cleared
  await expect(
    page.locator(".tag-pill", { hasText: "customOrigin" }),
  ).not.toBeVisible();

  // Saved storage check
  const lastSavedDict = await page.evaluate(() => window.__lastSavedDictionary);
  expect(lastSavedDict).toEqual({
    "": ["えー", "えーっと", "あのー", "そのー"],
  });
});
