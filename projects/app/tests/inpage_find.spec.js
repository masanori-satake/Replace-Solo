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

test("findInPage should cap the number of matches and report truncation", async ({
  page,
}) => {
  const paragraphs = Array.from(
    { length: 1100 },
    () => `<p class="scriptor-paragraph">ab</p>`,
  ).join("");
  await setupPage(page, `<div contenteditable="true">${paragraphs}</div>`);

  const state = await page.evaluate(() => findInPage("ab", {}));
  expect(state.count).toBe(1000);
  expect(state.truncated).toBe(true);

  // 上限未満では打ち切りにならない
  const small = Array.from(
    { length: 10 },
    () => `<p class="scriptor-paragraph">ab</p>`,
  ).join("");
  await setupPage(page, `<div contenteditable="true">${small}</div>`);
  const state2 = await page.evaluate(() => findInPage("ab", {}));
  expect(state2.count).toBe(10);
  expect(state2.truncated).toBe(false);
});

test("findInPage should not match across a non-editable element inside a paragraph", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">a<span contenteditable="false">担当者</span>b</p></div>`,
  );

  // 編集不可の要素を挟む "ab" は、要素ごと置換してしまうため一致にしない
  const state = await page.evaluate(() => findInPage("ab", {}));
  expect(state.count).toBe(0);
});

test("findInPage should match across editable inline elements", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">a<b>b</b>c</p></div>`,
  );

  const state = await page.evaluate(() => findInPage("abc", {}));
  expect(state.count).toBe(1);
});

test("regex matches should not be hidden by a discarded cross-paragraph match", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true">
       <p class="scriptor-paragraph">foo</p>
       <p class="scriptor-paragraph">bar</p>
     </div>`,
  );

  // 段落を跨ぐ "foo\s+bar" に先に一致して "foo" 単独を取りこぼさないこと
  const state = await page.evaluate(() =>
    findInPage("foo\\s+bar|foo", { useRegex: true }),
  );
  expect(state.count).toBe(1);
});

test("findInPage should ignore text under a hidden ancestor above the editor root", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div style="display:none"><div contenteditable="true"><p class="scriptor-paragraph">テスト文章です。</p></div></div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト", {}));
  expect(state.count).toBe(0);
});

test("find should follow when a hidden paragraph becomes visible", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph" style="display:none">テスト文章です。</p></div>`,
  );

  await page.evaluate(() => {
    window.__findStates = [];
    window.addEventListener("replace-solo:find-state", (e) => {
      window.__findStates.push(e.detail);
    });
    findInPage("テスト", {});
  });

  await page.evaluate(() => {
    document.querySelector("p").style.display = "";
  });

  // 属性変更を監視しているため、表示への切り替えで再検索される
  await page.waitForFunction(
    () => window.__findStates.some((s) => s.count === 1),
    null,
    { timeout: 5000 },
  );
});

test("fallback replacement should update only the target span in a single text node", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">cat cat</p></div>`,
  );

  const result = await page.evaluate(() => {
    document.execCommand = () => false;
    findInPage("cat", {});
    return replaceAllFindMatches("X");
  });
  expect(result.replacedCount).toBe(2);

  const text = await page.evaluate(
    () => document.querySelector("p").textContent,
  );
  expect(text).toBe("X X");
});

test("fallback replacement should not rewrite a range spanning multiple text nodes", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">ab<b>cd</b></p></div>`,
  );

  const result = await page.evaluate(() => {
    document.execCommand = () => false;
    findInPage("bc", {});
    return replaceCurrentFindMatch("X");
  });
  expect(result.replaced).toBe(false);

  const text = await page.evaluate(
    () => document.querySelector("p").textContent,
  );
  expect(text).toBe("abcd");
});

test("replace should be skipped when the matched text changed after the search", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">cat cat</p></div>`,
  );

  const result = await page.evaluate(() => {
    findInPage("cat", {});
    // 検索後にページ側が先頭の cat を cut へ書き換えた状況を再現
    const p = document.querySelector("p");
    p.firstChild.nodeValue = "cut cat";
    return replaceCurrentFindMatch("X");
  });
  expect(result.replaced).toBe(false);

  const text = await page.evaluate(
    () => document.querySelector("p").textContent,
  );
  expect(text).toBe("cut cat");
});

test("replace should be skipped when the match is no longer editable", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div contenteditable="true"><p class="scriptor-paragraph">cat です。</p></div>`,
  );

  const result = await page.evaluate(() => {
    findInPage("cat", {});
    // 検索後に編集不可へ変わった状況を再現
    document.querySelector("div").setAttribute("contenteditable", "false");
    return replaceCurrentFindMatch("X");
  });
  expect(result.replaced).toBe(false);

  const text = await page.evaluate(
    () => document.querySelector("p").textContent,
  );
  expect(text).toBe("cat です。");
});

test("find should follow visibility changes of ancestors above the editor root", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div id="wrap"><div contenteditable="true"><p class="scriptor-paragraph">テスト文章です。</p></div></div>`,
  );

  await page.evaluate(() => {
    window.__findStates = [];
    window.addEventListener("replace-solo:find-state", (e) => {
      window.__findStates.push(e.detail);
    });
    findInPage("テスト", {});
  });

  // ルートの外側のラッパーを非表示にすると、再検索で0件になる
  await page.evaluate(() => {
    document.getElementById("wrap").style.display = "none";
  });
  await page.waitForFunction(
    () => window.__findStates.some((s) => s.count === 0),
    null,
    { timeout: 5000 },
  );

  // 再び表示すると、一致が戻る
  await page.evaluate(() => {
    window.__findStates = [];
    document.getElementById("wrap").style.display = "";
  });
  await page.waitForFunction(
    () => window.__findStates.some((s) => s.count === 1),
    null,
    { timeout: 5000 },
  );
});

test("navigateFindMatches should scroll the editor element itself when it is the scroller", async ({
  page,
}) => {
  const filler = Array.from({ length: 40 }, (_, i) => `フィラー行${i}`).join(
    "<br>",
  );
  await setupPage(
    page,
    `<div id="scroller" contenteditable="true" style="height: 200px; overflow-y: auto;">テスト（先頭）<br>${filler}<br>テスト（末尾）</div>`,
  );

  const state = await page.evaluate(() => findInPage("テスト", {}));
  expect(state.count).toBe(2);

  await page.evaluate(() => navigateFindMatches(1));

  // 末尾の一致（スクローラ自身の直接のテキスト）が可視領域に入ること
  await page.waitForFunction(
    () => {
      const scroller = document.getElementById("scroller");
      const s = scroller.getBoundingClientRect();
      const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.includes("末尾")) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const r = range.getBoundingClientRect();
          return r.top >= s.top && r.bottom <= s.bottom;
        }
      }
      return false;
    },
    null,
    { timeout: 3000 },
  );
});
