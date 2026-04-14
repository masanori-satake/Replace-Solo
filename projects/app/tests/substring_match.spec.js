const { test, expect } = require('@playwright/test');
const path = require('path');

test('should pre-fill replacement if a dictionary entry is a substring of the candidate', async ({ page }) => {
  const filePath = 'file://' + path.resolve('projects/app/pages/sidepanel.html');

  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { dictionary: { "Sato": ["佐藤"] } };
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
        getManifest: () => ({ version: '0.16.0' }),
        lastError: null
      },
      tabs: {
        query: (query, cb) => {
            const tabs = [{ id: 123 }];
            if (cb) cb(tabs);
            return Promise.resolve(tabs);
        }
      },
      sidePanel: {
        setPanelBehavior: () => {}
      }
    };
  });

  await page.goto(filePath);
  await expect(page.locator('#extract-btn')).toBeVisible();

  // Manually add "佐藤様"
  await page.fill('#manual-word', '佐藤様');
  await page.click('#add-word-btn');

  // Verify the row is added
  const row = page.locator('.word-row');
  await expect(row).toBeVisible();

  const originText = await row.locator('.word-origin').textContent();
  const replaceInput = row.locator('.replace-input');
  const applyCheck = row.locator('.apply-check');

  const replaceValue = await replaceInput.inputValue();
  const isChecked = await applyCheck.evaluate(el => el.checked);

  console.log('Origin:', originText);
  console.log('Replace value:', replaceValue);
  console.log('Apply checked:', isChecked);

  expect(originText).toBe('佐藤様');
  // Should be pre-filled because "佐藤" is in dictionary
  expect(replaceValue).toBe('Sato様');
  expect(isChecked).toBe(true);
});
