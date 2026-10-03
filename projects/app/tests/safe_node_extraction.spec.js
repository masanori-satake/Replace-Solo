const { test, expect } = require("@playwright/test");
const path = require("path");

test("isSafeTextNode and getSafeTextNodes correctly filter unsafe/protected nodes", async ({ page }) => {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="editor" contenteditable="true">
          <p>プロジェクトの進捗報告</p>
          <!-- contenteditable="false" block -->
          <span contenteditable="false" class="mention">@Satake Masanori</span>
          <p>件名：開発スケジュールについて</p>
          <!-- entity data attributes -->
          <span data-entity-id="user-123">masa.satake@gmail.com</span>
          <span data-mention-id="m-456">@山田太郎</span>
          <span data-tag-id="t-789">進行状況：遅延中</span>
          <span data-component-type="date-picker">4月8日(水)</span>
          <!-- generic data- attribute (should NOT be excluded) -->
          <span data-custom-label="plain-text">重要課題</span>
          <!-- interactive role -->
          <div role="button">クリックボタン</div>
          <!-- custom element -->
          <person-chip>カスタムチップ</person-chip>
        </div>
      </body>
    </html>
  `);

  await page.addScriptTag({
    path: path.resolve("projects/app/scripts/content.js"),
  });

  const extractedText = await page.evaluate(() => {
    const root = document.getElementById("editor");
    return getEditableInnerText(root);
  });

  console.log("Extracted text:\n", extractedText);

  expect(extractedText).toContain("プロジェクトの進捗報告");
  expect(extractedText).toContain("件名：開発スケジュールについて");
  expect(extractedText).toContain("重要課題");

  expect(extractedText).not.toContain("Satake Masanori");
  expect(extractedText).not.toContain("masa.satake@gmail.com");
  expect(extractedText).not.toContain("山田太郎");
  expect(extractedText).not.toContain("遅延中");
  expect(extractedText).not.toContain("4月8日");
  expect(extractedText).not.toContain("クリックボタン");
  expect(extractedText).not.toContain("カスタムチップ");
});

test("findRangesAcrossNodes skips target matches inside unsafe nodes", async ({ page }) => {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="editor" contenteditable="true">
          <p>担当者Aが対応予定</p>
          <span contenteditable="false">担当者A</span>
          <span data-user-id="user-999">担当者A</span>
        </div>
      </body>
    </html>
  `);

  await page.addScriptTag({
    path: path.resolve("projects/app/scripts/content.js"),
  });

  const rangeCount = await page.evaluate(() => {
    const root = document.getElementById("editor");
    const ranges = findRangesAcrossNodes(root, [{ origin: "担当者A" }]);
    return ranges.length;
  });

  expect(rangeCount).toBe(1);
});
