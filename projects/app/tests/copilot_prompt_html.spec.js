const { test, expect } = require("@playwright/test");
const path = require("path");

test("Content script insertCopilotPromptToggle should insert toggle block after title or as details element", async ({
  page,
}) => {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="scriptor-canvas scriptor-canvas-grid-layout">
          <h1 data-data-id="page-title" contenteditable="true">会議メモ</h1>
          <div class="lc-canvas-body">
            <p class="scriptor-paragraph" contenteditable="true">本文の第一ブロック</p>
          </div>
        </div>
      </body>
    </html>
  `);

  await page.addScriptTag({
    path: path.resolve("projects/app/scripts/content.js"),
  });

  const markdownPrompt = "> 🔽 【Facilitatorへの指示・用語定義】\n> 指示内容";
  const promptText = "🔽 【Facilitatorへの指示・用語定義】\n指示内容";

  const result = await page.evaluate(
    ({ markdownPrompt, promptText }) => {
      return insertCopilotPromptToggle(markdownPrompt, promptText);
    },
    { markdownPrompt, promptText },
  );

  expect(result).toBe(true);

  // Check contenteditable paragraph received input
  const paragraphText = await page
    .locator(".scriptor-paragraph")
    .textContent();
  expect(paragraphText).toContain("> 🔽 【Facilitatorへの指示・用語定義】");
});
