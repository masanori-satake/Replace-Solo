const { test, expect } = require("@playwright/test");
const path = require("path");

const CONTENT_PATH = path.resolve("projects/app/scripts/content.js");

// content.js の検索モード関数群（findInPage など）をモックページで検証する。
// パネル（inpage.js）は closed Shadow DOM のため、UI ではなくページ側の
// 検索エンジンの振る舞いを対象にする（既存の content_highlight.spec.js と同じ方針）。
async function setupPage(page, bodyHtml) {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head><title>Loop Mock Page</title></head>
      <body>${bodyHtml}</body>
    </html>
  `);
  await page.addScriptTag({ path: CONTENT_PATH });
}

test("findInPage should count matches and register highlights", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">テスト文章です。テストは大事です。</p>
       <p class="scriptor-paragraph">もう一つのテストです。</p>
     </div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト", {}));
  expect(state.count).toBe(3);
  expect(state.currentIndex).toBe(0);
  expect(state.error).toBeNull();

  const findSize = await page.evaluate(
    () => CSS.highlights.get("replace-solo-find")?.size ?? 0,
  );
  expect(findSize).toBe(3);
  const currentSize = await page.evaluate(
    () => CSS.highlights.get("replace-solo-find-current")?.size ?? 0,
  );
  expect(currentSize).toBe(1);
});

test("navigateFindMatches should move the current match and wrap around", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">テスト文章です。テストは大事です。</p>
       <p class="scriptor-paragraph">もう一つのテストです。</p>
     </div>`,
  );

  await page.evaluate(() => findInPage("テスト", {}));
  let state = await page.evaluate(() => navigateFindMatches(1));
  expect(state.currentIndex).toBe(1);
  state = await page.evaluate(() => navigateFindMatches(1));
  expect(state.currentIndex).toBe(2);
  state = await page.evaluate(() => navigateFindMatches(1));
  expect(state.currentIndex).toBe(0);
  state = await page.evaluate(() => navigateFindMatches(-1));
  expect(state.currentIndex).toBe(2);
});

test("findInPage should respect the caseSensitive option", async ({ page }) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">Loop loop LOOP</p></div>`,
  );

  let state = await page.evaluate(() => findInPage("loop", {}));
  expect(state.count).toBe(3);
  state = await page.evaluate(() =>
    findInPage("loop", { caseSensitive: true }),
  );
  expect(state.count).toBe(1);
});

test("findInPage should treat the query literally unless useRegex is on", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">値は1.5で、125ではありません</p></div>`,
  );

  let state = await page.evaluate(() => findInPage("1.5", {}));
  expect(state.count).toBe(1);
  state = await page.evaluate(() => findInPage("1.5", { useRegex: true }));
  expect(state.count).toBe(2);
});

test("findInPage should support regex search and report an invalid regex", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">注文123と注文45です</p></div>`,
  );

  let state = await page.evaluate(() =>
    findInPage("注文\\d+", { useRegex: true }),
  );
  expect(state.count).toBe(2);
  expect(state.error).toBeNull();

  state = await page.evaluate(() => findInPage("[", { useRegex: true }));
  expect(state.count).toBe(0);
  expect(state.error).toBeTruthy();
});

test("findInPage should match text spanning multiple text nodes within one paragraph", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">テス<b>ト文</b>章です</p></div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト文章", {}));
  expect(state.count).toBe(1);
});

test("findInPage should not match across paragraphs", async ({ page }) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">テス</p>
       <p class="scriptor-paragraph">ト文章</p>
     </div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト文章", {}));
  expect(state.count).toBe(0);
});

test("replaceCurrentFindMatch should replace one occurrence and refresh the state", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">テスト文章です。テストは大事です。</p></div>`,
  );

  await page.evaluate(() => findInPage("テスト", {}));
  const result = await page.evaluate(() => replaceCurrentFindMatch("検証"));
  expect(result.replaced).toBe(true);
  expect(result.count).toBe(1);

  const text = await page.evaluate(
    () => document.querySelector("p").textContent,
  );
  expect(text).toBe("検証文章です。テストは大事です。");
});

test("replaceAllFindMatches should replace every occurrence", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">テスト文章です。テストは大事です。</p>
       <p class="scriptor-paragraph">最後のテストです。</p>
     </div>`,
  );

  await page.evaluate(() => findInPage("テスト", {}));
  const result = await page.evaluate(() => replaceAllFindMatches("検証"));
  expect(result.replacedCount).toBe(3);
  expect(result.count).toBe(0);

  const text = await page.evaluate(() => document.body.textContent);
  expect(text).not.toContain("テスト");
  expect(text.match(/検証/g)).toHaveLength(3);
});

test("findInPage should not match text inside display:none elements", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">見えているテストです。</p>
       <p class="scriptor-paragraph" style="display:none">隠れたテストです。</p>
     </div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト", {}));
  expect(state.count).toBe(1);
});

test("findInPage should not match text inside visibility:hidden elements", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">見えているテストと<span style="visibility:hidden">隠れたテスト</span>です。</p>
     </div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト", {}));
  expect(state.count).toBe(1);
});

test("findInPage should match a child that re-enables visibility inside a hidden parent", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph" style="visibility:hidden">隠れた<span style="visibility:visible">テスト</span>です。</p>
     </div>`,
  );

  // visibility は子要素が visible を指定すれば再表示されるため、ヒットするのが正しい
  const state = await page.evaluate(() => findInPage("テスト", {}));
  expect(state.count).toBe(1);
});

test("extraction should also exclude invisible text (shared node filter)", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">見えている文章です。</p>
       <p class="scriptor-paragraph" style="display:none">隠れた文章です。</p>
     </div>`,
  );

  const text = await page.evaluate(() => {
    const root = getTargetRoot();
    return getEditableInnerText(root);
  });
  expect(text).toContain("見えている文章です。");
  expect(text).not.toContain("隠れた文章です。");
});

test("find state should follow external document changes such as undo", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">テスト文章です。テストは大事です。</p></div>`,
  );

  await page.evaluate(() => findInPage("テスト", {}));
  const replaced = await page.evaluate(() => replaceAllFindMatches("検証"));
  expect(replaced.count).toBe(0);

  // Undo で本文が戻るのと同じことを、DOM の直接変更で再現する。
  // 置換自体による変更でもイベントが飛ぶため、件数が戻ったイベントを待つ。
  const state = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("no find-state event")),
          5000,
        );
        window.addEventListener("replace-solo:find-state", (e) => {
          if (e.detail.count === 2) {
            clearTimeout(timer);
            resolve(e.detail);
          }
        });
        document.querySelector("p").textContent =
          "テスト文章です。テストは大事です。";
      }),
  );
  expect(state.count).toBe(2);

  const findSize = await page.evaluate(
    () => CSS.highlights.get("replace-solo-find")?.size ?? 0,
  );
  expect(findSize).toBe(2);
});

test("find state should follow manual edits that add matches", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">テストは1件だけです。</p></div>`,
  );

  const initial = await page.evaluate(() => findInPage("テスト", {}));
  expect(initial.count).toBe(1);

  const state = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("no find-state event")),
          5000,
        );
        window.addEventListener("replace-solo:find-state", (e) => {
          if (e.detail.count === 2) {
            clearTimeout(timer);
            resolve(e.detail);
          }
        });
        document.querySelector("p").firstChild.nodeValue =
          "テストとテストで2件です。";
      }),
  );
  expect(state.count).toBe(2);
  expect(state.currentIndex).toBe(0);
});

test("navigateFindMatches should scroll the current match into the visible area", async ({
  page,
}) => {
  const filler = Array.from(
    { length: 40 },
    (_, i) => `<p class="scriptor-paragraph">フィラー行${i}です。</p>`,
  ).join("");
  await setupPage(
    page,
    `<div id="scroller" contenteditable="true" style="height: 200px; overflow-y: auto;">
       <p class="scriptor-paragraph" id="first-hit">テスト（先頭）です。</p>
       ${filler}
       <p class="scriptor-paragraph" id="last-hit">テスト（末尾）です。</p>
     </div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト", {}));
  expect(state.count).toBe(2);

  const isInsideScroller = (id) => {
    const s = document.getElementById("scroller").getBoundingClientRect();
    const r = document.getElementById(id).getBoundingClientRect();
    return r.top >= s.top && r.bottom <= s.bottom;
  };

  // 次へ: 末尾の一致がスクロール領域内に見えること
  await page.evaluate(() => navigateFindMatches(1));
  await page.waitForFunction(isInsideScroller, "last-hit", { timeout: 3000 });

  // 前へ: 先頭の一致も同様に見えること（スクロール不足で外れる不具合のケース）
  await page.evaluate(() => navigateFindMatches(-1));
  await page.waitForFunction(isInsideScroller, "first-hit", { timeout: 3000 });
});

test("clearFindMatches should remove highlights and reset the state", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">テスト文章です。</p></div>`,
  );

  await page.evaluate(() => findInPage("テスト", {}));
  const before = await page.evaluate(() =>
    CSS.highlights.has("replace-solo-find"),
  );
  expect(before).toBe(true);

  const state = await page.evaluate(() => {
    clearFindMatches();
    return navigateFindMatches(1);
  });
  expect(state.count).toBe(0);

  const after = await page.evaluate(() =>
    CSS.highlights.has("replace-solo-find"),
  );
  expect(after).toBe(false);
});
