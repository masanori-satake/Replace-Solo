const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const APP_DIR = path.resolve("projects/app");

// 「東京スカイツリー」(日本語) と「JavaScript」(非日本語・固有名詞) が抽出される本文
// ※ kuromoji の形態素解析は文脈依存のため、JavaScript が固有名詞になる
//    並び（TypeScript との並立）で文面を固定している
const PAGE_TEXT =
  "JavaScriptとTypeScriptを勉強しました。東京スカイツリーに行きます。東京スカイツリーは高い建物です。";

test.setTimeout(180000);

// Load the in-page UI on a mock Loop page with a stateful chrome.storage
// stub whose contents are backed by a Node-side object (so tests can
// assert what the panel saved). Shadow roots are forced open so the
// test can inspect and operate the panel.
async function loadInpage(page, store) {
  await page.exposeFunction("__rsStoreGetAll", () => ({ ...store }));
  await page.exposeFunction("__rsStoreSet", (obj) => {
    Object.assign(store, obj);
  });

  await page.route("https://loop.microsoft.com/**", async (route) => {
    const url = route.request().url();
    const marker = "/__ext__/";
    if (url.includes(marker)) {
      // kuromoji の辞書ファイル等を拡張機能の実ファイルから返す
      const rel = url.split(marker)[1].split("?")[0];
      const file = path.join(APP_DIR, rel);
      if (fs.existsSync(file)) {
        await route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: fs.readFileSync(file),
        });
      } else {
        await route.fulfill({ status: 404, body: "not found" });
      }
      return;
    }
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!DOCTYPE html>
        <html>
          <head><title>Loop Mock Page</title></head>
          <body>
            <div contenteditable="true"><p>${PAGE_TEXT}</p></div>
          </body>
        </html>`,
    });
  });

  await page.addInitScript(async () => {
    // Force open shadow roots so the test can inspect the panel
    const origAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      return origAttachShadow.call(this, { ...init, mode: "open" });
    };
    const pick = (all, keys) => {
      if (keys == null) return all;
      if (typeof keys === "string") {
        return keys in all ? { [keys]: all[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) if (k in all) out[k] = all[k];
        return out;
      }
      return all;
    };
    window.chrome = {
      storage: {
        local: {
          get: async (keys) => pick(await window.__rsStoreGetAll(), keys),
          set: async (data) => {
            await window.__rsStoreSet(data);
          },
          onChanged: { addListener: () => {} },
        },
      },
      runtime: {
        getURL: (p) => `https://loop.microsoft.com/__ext__/${p}`,
        onMessage: { addListener: () => {} },
      },
    };
  });

  await page.goto("https://loop.microsoft.com/p/test-page");

  // Inject scripts in the same order as manifest content_scripts
  await page.addScriptTag({
    path: path.join(APP_DIR, "lib/kuromoji/kuromoji.js"),
  });
  await page.addScriptTag({ path: path.join(APP_DIR, "scripts/content.js") });
  await page.addScriptTag({ path: path.join(APP_DIR, "scripts/inpage.js") });

  await expect(page.locator("#replace-solo-inpage-host")).toBeAttached({
    timeout: 3000,
  });
}

async function clickInPanel(page, selector) {
  await page.evaluate((sel) => {
    const host = document.querySelector("#replace-solo-inpage-host");
    host.shadowRoot.querySelector(sel).click();
  }, selector);
}

async function getOrigins(page) {
  return page.evaluate(() => {
    const host = document.querySelector("#replace-solo-inpage-host");
    return Array.from(
      host.shadowRoot.querySelectorAll(".rs-row .rs-origin"),
    ).map((el) => el.textContent);
  });
}

async function getTogglePressed(page, selector) {
  return page.evaluate((sel) => {
    const host = document.querySelector("#replace-solo-inpage-host");
    return host.shadowRoot.querySelector(sel).getAttribute("aria-pressed");
  }, selector);
}

async function waitForOrigins(page, { includes = [], excludes = [] }) {
  await page.waitForFunction(
    ({ includes, excludes }) => {
      const host = document.querySelector("#replace-solo-inpage-host");
      if (!host || !host.shadowRoot) return false;
      const origins = Array.from(
        host.shadowRoot.querySelectorAll(".rs-row .rs-origin"),
      ).map((el) => el.textContent);
      return (
        includes.every((w) => origins.includes(w)) &&
        excludes.every((w) => !origins.includes(w))
      );
    },
    { includes, excludes },
    { timeout: 60000 },
  );
}

test("inpage toggles should reflect stored settings when the panel opens", async ({
  page,
}) => {
  const store = { highlightEnabled: true, preferJapanese: false };
  await loadInpage(page, store);

  await clickInPanel(page, ".rs-launcher");

  await expect
    .poll(() => getTogglePressed(page, ".rs-toggle-highlight"))
    .toBe("true");
  await expect
    .poll(() => getTogglePressed(page, ".rs-toggle-jaonly"))
    .toBe("false");

  const activeStates = await page.evaluate(() => {
    const host = document.querySelector("#replace-solo-inpage-host");
    return {
      highlight: host.shadowRoot
        .querySelector(".rs-toggle-highlight")
        .classList.contains("active"),
      jaOnly: host.shadowRoot
        .querySelector(".rs-toggle-jaonly")
        .classList.contains("active"),
    };
  });
  expect(activeStates.highlight).toBe(true);
  expect(activeStates.jaOnly).toBe(false);
});

test("changing inpage toggles should save to storage immediately", async ({
  page,
}) => {
  const store = {};
  await loadInpage(page, store);

  await clickInPanel(page, ".rs-launcher");

  // Defaults: highlight ON, 日本語のみ ON (both default true)
  await expect
    .poll(() => getTogglePressed(page, ".rs-toggle-highlight"))
    .toBe("true");
  await expect
    .poll(() => getTogglePressed(page, ".rs-toggle-jaonly"))
    .toBe("true");

  await clickInPanel(page, ".rs-toggle-highlight");
  await expect.poll(() => store.highlightEnabled).toBe(false);
  await expect
    .poll(() => getTogglePressed(page, ".rs-toggle-highlight"))
    .toBe("false");

  await clickInPanel(page, ".rs-toggle-highlight");
  await expect.poll(() => store.highlightEnabled).toBe(true);

  await clickInPanel(page, ".rs-toggle-jaonly");
  await expect.poll(() => store.preferJapanese).toBe(false);
  await expect
    .poll(() => getTogglePressed(page, ".rs-toggle-jaonly"))
    .toBe("false");
});

test("japanese-only toggle should re-filter the extracted list without re-extracting", async ({
  page,
}) => {
  const store = {};
  await loadInpage(page, store);

  await clickInPanel(page, ".rs-launcher");

  // Auto-extraction on first open; 日本語のみ ON hides "JavaScript"
  await waitForOrigins(page, { includes: ["東京スカイツリー"] });
  const origins = await getOrigins(page);
  expect(origins).toContain("東京スカイツリー");
  expect(origins).not.toContain("JavaScript");

  // Turn 日本語のみ OFF: the retained list is re-rendered, JavaScript appears
  await clickInPanel(page, ".rs-toggle-jaonly");
  await waitForOrigins(page, { includes: ["JavaScript"] });
  await expect.poll(() => store.preferJapanese).toBe(false);

  // Turn it back ON: JavaScript disappears again, Japanese words stay
  await clickInPanel(page, ".rs-toggle-jaonly");
  await waitForOrigins(page, {
    includes: ["東京スカイツリー"],
    excludes: ["JavaScript"],
  });
  await expect.poll(() => store.preferJapanese).toBe(true);
});

test("first open should auto-extract and reopening should preserve in-progress edits", async ({
  page,
}) => {
  const store = {};
  await loadInpage(page, store);

  await clickInPanel(page, ".rs-launcher");

  // No 対象抽出 click: rows appear automatically on first open
  await waitForOrigins(page, { includes: ["東京スカイツリー"] });

  // Simulate an in-progress edit of the replacement text
  await page.evaluate(() => {
    const host = document.querySelector("#replace-solo-inpage-host");
    const input = host.shadowRoot.querySelector(".rs-row .rs-replace");
    input.value = "テスト置換";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // Change the page text so a re-extraction would produce a different list
  await page.evaluate(() => {
    document.querySelector("[contenteditable] p").textContent =
      "大阪城に行きます。大阪城は大きい建物です。";
  });

  await clickInPanel(page, ".rs-close");
  await clickInPanel(page, ".rs-launcher");

  // Give any (incorrect) re-extraction a chance to run, then verify the
  // original list and the edit are untouched
  await page.waitForTimeout(3000);
  const origins = await getOrigins(page);
  expect(origins).toContain("東京スカイツリー");
  expect(origins).not.toContain("大阪城");

  const value = await page.evaluate(() => {
    const host = document.querySelector("#replace-solo-inpage-host");
    return host.shadowRoot.querySelector(".rs-row .rs-replace").value;
  });
  expect(value).toBe("テスト置換");
});
