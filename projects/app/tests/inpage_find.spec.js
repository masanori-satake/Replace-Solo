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

test("findInPage should respect the caseSensitive option", async ({
  page,
}) => {
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
