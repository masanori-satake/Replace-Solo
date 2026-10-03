const { test, expect } = require("@playwright/test");
const path = require("path");

test("content script highlightWord should highlight matching text and clearHighlight should remove it", async ({
  page,
}) => {
  // Create an in-memory page content that mimics Loop editor structure with editable elements
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head><title>Loop Mock Page</title></head>
      <body>
        <div id="editable-area" contenteditable="true">
          <p>これはテスト用の本文です。テスト単語がここに含まれています。</p>
          <p>もう一つのテスト単語がここにもあります。</p>
        </div>
      </body>
    </html>
  `);

  // Inject content.js script
  const contentScriptPath = path.resolve("projects/app/scripts/content.js");
  await page.addScriptTag({ path: contentScriptPath });

  // Simulate HIGHLIGHT_WORD message
  await page.evaluate(() => {
    window.postMessage({ type: "TEST_HIGHLIGHT" }, "*");
  });

  // Call highlightWord directly via evaluated message listener or runtime handler
  const isHighlighted = await page.evaluate(() => {
    // Send message to internal listener logic directly or execute highlightWord("テスト単語")
    if (typeof highlightWord === "function") {
      highlightWord("テスト単語");
    }
    return (
      typeof CSS !== "undefined" &&
      CSS.highlights &&
      CSS.highlights.has("replace-solo-target")
    );
  });

  expect(isHighlighted).toBe(true);

  // Verify Highlight object contains 2 ranges
  const highlightCount = await page.evaluate(() => {
    const hl = CSS.highlights.get("replace-solo-target");
    return hl ? hl.size : 0;
  });
  expect(highlightCount).toBe(2);

  // Call clearHighlight
  const isCleared = await page.evaluate(() => {
    if (typeof clearHighlight === "function") {
      clearHighlight();
    }
    return !CSS.highlights.has("replace-solo-target");
  });

  expect(isCleared).toBe(true);
});
