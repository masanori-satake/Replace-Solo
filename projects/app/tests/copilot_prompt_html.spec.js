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

  expect(
    await page.evaluate(
      () =>
        findTargetBlockAfterTitle().targetBlock ===
        document.querySelector(".scriptor-paragraph"),
    ),
  ).toBe(true);

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
  const paragraphText = await page.locator(".scriptor-paragraph").textContent();
  expect(paragraphText).toContain("> 🔽 【Facilitatorへの指示・用語定義】");
});

for (const bodyClass of ["lc-canvas-body", "scriptor-pageBody", null]) {
  for (const useDomFallback of [false, true]) {
    test(`Empty page (${bodyClass || "no body container"}) inserts outside the title via ${useDomFallback ? "DOM fallback" : "input emulation"}`, async ({
      page,
    }) => {
      // Exercise Loop's canvas root rather than the document.body fallback.
      await page.route("https://loop.microsoft.com/p/test", (route) =>
        route.fulfill({ body: "<html><body></body></html>" }),
      );
      await page.goto("https://loop.microsoft.com/p/test");
      await page.setContent(`
        <div class="scriptor-canvas scriptor-canvas-grid-layout">
          <div class="lc-titleEditor">
            <h1 data-data-id="page-title" contenteditable="true">会議メモ</h1>
          </div>
          ${bodyClass ? `<div class="${bodyClass}"></div>` : ""}
        </div>
      `);
      await page.addScriptTag({
        path: path.resolve("projects/app/scripts/content.js"),
      });

      const result = await page.evaluate(
        ({ bodyClass, useDomFallback }) => {
          if (useDomFallback) document.execCommand = () => false;
          const success = insertCopilotPromptToggle(
            "> Prompt heading\n> Prompt body",
            "Prompt heading\nPrompt body",
          );
          const title = document.querySelector('[data-data-id="page-title"]');
          const body = document.querySelector(
            bodyClass ? `.${bodyClass}` : ".scriptor-canvas",
          );
          const target = findTargetBlockAfterTitle().targetBlock;
          return {
            success,
            titleText: title.textContent,
            bodyText: body.textContent,
            targetInBody: body.contains(target),
            targetOutsideTitle:
              !!target && !title.contains(target) && !target.contains(title),
            toggleInBody: !!body.querySelector("details"),
          };
        },
        { bodyClass, useDomFallback },
      );

      expect(result.success).toBe(true);
      expect(result.titleText).toBe("会議メモ");
      expect(result.bodyText).toContain("Prompt heading");
      expect(result.bodyText).toContain("Prompt body");
      expect(result.targetInBody).toBe(true);
      expect(result.targetOutsideTitle).toBe(true);
      expect(result.toggleInBody).toBe(useDomFallback);
    });
  }
}
