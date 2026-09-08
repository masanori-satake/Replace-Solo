const { test, expect } = require("@playwright/test");
const path = require("path");

test("rejects __proto__ when adding or renaming dictionary entries", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.setCalls = [];
    window.chrome = {
      storage: {
        local: {
          get: () =>
            Promise.resolve({ dictionary: { "": [], existing: ["origin"] } }),
          set: (data) => {
            window.setCalls.push(data);
            return Promise.resolve();
          },
        },
        onChanged: {
          addListener: () => {},
        },
      },
    };
  });

  const filePath =
    "file://" + path.resolve("projects/app/pages/editor.html");
  await page.goto(filePath);
  await expect(page.locator(".dictionary-row")).toHaveCount(2);

  await page.click("#add-row-btn");
  await page.fill("#prompt-input", "__proto__");
  await page.click("#prompt-ok");

  await expect(page.locator("#alert-message")).toHaveText(
    "この置換文字列は使用できません。",
  );
  await expect(page.locator(".dictionary-row")).toHaveCount(2);
  await page.click("#alert-ok");
  await page.click("#prompt-cancel");

  const targetInput = page.locator(
    '.dictionary-row input[placeholder="置換後の文字列"]',
  );
  await targetInput.fill("__proto__");
  await targetInput.dispatchEvent("change");

  await expect(targetInput).toHaveValue("existing");
  await expect(page.locator("#alert-message")).toHaveText(
    "この置換文字列は使用できません。",
  );
  expect(await page.evaluate(() => window.setCalls)).toEqual([]);
});
