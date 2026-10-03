const { test, expect } = require("@playwright/test");
const path = require("path");

test("isSafeTextNode and getSafeTextNodes correctly filter unsafe/protected nodes and preserve aria-label in editable nodes", async ({ page }) => {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="editor" contenteditable="true" class="scriptor-pageBody" aria-label="Loop Paragraph Container">
          <div class="scriptor-paragraph">
            <span class="scriptor-textRun scriptor-inline">プロジェクトの進捗報告</span> <span>（補足情報）</span>
            <br class="scriptor-EOP" />
          </div>
          <!-- contenteditable="false" block -->
          <span contenteditable="false" class="mention">@Satake Masanori</span>
          <div class="scriptor-paragraph">
            <span class="scriptor-textRun scriptor-inline">件名：開発スケジュールについて</span>
          </div>
          <!-- entity data attributes -->
          <span data-entity-id="user-123">masa.satake@gmail.com</span>
          <span data-mention-id="m-456">@山田太郎</span>
          <span data-tag-id="t-789">進行状況：遅延中</span>
          <span data-component-type="date-picker">4月8日(水)</span>
          <!-- generic data- attribute (should NOT be excluded) -->
          <span data-custom-label="plain-text">重要課題</span>
          <!-- interactive role -->
          <div role="button">クリックボタン</div>
          <button>HTMLボタン</button>
          <div class="scriptor-blocks-commands-hover">ホバーコマンド</div>
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

  expect(extractedText).toContain("プロジェクトの進捗報告 （補足情報）");
  expect(extractedText).toContain("件名：開発スケジュールについて");
  expect(extractedText).toContain("重要課題");

  expect(extractedText).not.toContain("Satake Masanori");
  expect(extractedText).not.toContain("masa.satake@gmail.com");
  expect(extractedText).not.toContain("山田太郎");
  expect(extractedText).not.toContain("遅延中");
  expect(extractedText).not.toContain("4月8日");
  expect(extractedText).not.toContain("クリックボタン");
  expect(extractedText).not.toContain("HTMLボタン");
  expect(extractedText).not.toContain("ホバーコマンド");
  expect(extractedText).not.toContain("カスタムチップ");
});

test("findRangesAcrossNodes skips target matches inside unsafe nodes and treats scriptor-paragraph as container boundary", async ({ page }) => {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="editor" contenteditable="true">
          <div class="scriptor-paragraph">
            <span class="scriptor-textRun scriptor-inline">担当者Aが対応予定</span>
          </div>
          <div class="scriptor-paragraph">
            <span contenteditable="false">担当者A</span>
            <span data-user-id="user-999">担当者A</span>
            <button>担当者A</button>
          </div>
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
