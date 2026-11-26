/**
 * Replace-Solo In-Page UI
 *
 * PWA（アプリ）ウィンドウなど、Chrome のサイドパネルが存在しない環境でも
 * Replace-Solo を使えるようにするためのページ内 UI。
 * ページ内にフローティングボタンとパネル（Shadow DOM）を表示し、
 * サイドパネル版と同じ抽出・置換・辞書の仕組みを提供する。
 *
 * scripts/content.js と同じ isolated world で動作するため、
 * getTargetRoot() / getEditableInnerText() / replaceByEmulationBatch() /
 * highlightWord() / clearHighlight() と、検索モード用の
 * findInPage() / navigateFindMatches() / replaceCurrentFindMatch() /
 * replaceAllFindMatches() / clearFindMatches() を直接呼び出す。
 * 辞書は chrome.storage.local の "dictionary" をサイドパネル版と共有する。
 */

(function () {
  "use strict";

  if (window.replaceSoloInpageLoaded) return;
  window.replaceSoloInpageLoaded = true;

  // ===== 定数定義（js/sidepanel.js から移植） =====
  const EXCLUDED_NOUN_TYPES = new Set(["代名詞", "非自立"]);
  const DEFAULT_DICTIONARY = { "": ["えー", "えーっと", "あのー", "そのー"] };
  const JAPANESE_CHAR_REGEX =
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF66-\uFF9F]/;
  const IDENTIFIER_REGEX = /^[a-zA-Z0-9.\-_@]{3,}$/;
  const TRIM_SYMBOLS_SET =
    "[\\s()\\[\\]{}<>（）［］｛｝〈〉《》「」『』〔〕〖〗〘〙〚〛'\"`“”‘’。、！？!?:;：；・,.，．･+*\\/\\\\|~〜～=#$%\\^&@_…-]";
  const TRIM_SYMBOLS_REGEX = new RegExp(
    `^${TRIM_SYMBOLS_SET}+|${TRIM_SYMBOLS_SET}+$`,
    "g",
  );
  const JA_COLLATOR = new Intl.Collator("ja");

  // ===== 状態 =====
  let tokenizer = null;
  let tokenizerPromise = null;
  let localDictionary = {}; // {"target": ["origin1", "origin2",...]}
  let dictOrigins = new Set(); // キャッシュ: 全ての元単語のSet
  let dictMatchCache = new Map(); // キャッシュ: 単語ごとの置換判定結果
  let reverseDictionary = {}; // キャッシュ: {"origin": ["target1",...]}
  let highlightEnabled = false;
  let preferJapanese = true;
  let isJapaneseOnly = true;
  let currentWords = new Set(); // 現在リストされている単語（重複チェック用）
  let manualWords = new Set(); // 手動で追加された単語
  let lastExtractedWords = []; // 直近に抽出した単語（フィルタ前。「日本語のみ」切替時の再描画用）

  // ===== DOM 参照 =====
  let hostEl = null;
  let launcherEl = null;
  let panelEl = null;
  let listEl = null;
  let statusEl = null;
  let manualInputEl = null;
  let highlightToggleEl = null;
  let japaneseOnlyToggleEl = null;
  let panelOpen = false;

  // ===== 検索モードの状態と DOM 参照 =====
  let panelMode = "dict"; // "dict" | "find"
  let findReplaceExpanded = false;
  let findDebounceTimer = null;
  let findLastQuery = ""; // 直近に検索を実行した検索語（Enter 時の未検索判定用）
  let dictSectionEl = null;
  let findSectionEl = null;
  let modeDictBtnEl = null;
  let modeFindBtnEl = null;
  let findInputEl = null;
  let findCountEl = null;
  let findReplaceRowEl = null;
  let findReplaceInputEl = null;
  let findStatusEl = null;
  let findCaseToggleEl = null;
  let findRegexToggleEl = null;

  // ===== 辞書まわり（js/sidepanel.js から移植） =====

  // 辞書のキャッシュ（Set/Map形式）を更新する
  function updateDictCache() {
    dictOrigins.clear();
    dictMatchCache.clear();
    reverseDictionary = {};

    for (const [target, origins] of Object.entries(localDictionary)) {
      if (!Array.isArray(origins)) continue;
      origins.forEach((origin) => {
        if (typeof origin !== "string") return;
        dictOrigins.add(origin);
        if (!Object.prototype.hasOwnProperty.call(reverseDictionary, origin)) {
          reverseDictionary[origin] = [];
        }
        if (!reverseDictionary[origin].includes(target)) {
          reverseDictionary[origin].push(target);
        }
      });
    }
  }

  function getDictMatch(word) {
    if (dictMatchCache.has(word)) return dictMatchCache.get(word);

    const result = (() => {
      // 完全一致のみを検索
      const exactMatches = Object.prototype.hasOwnProperty.call(
        reverseDictionary,
        word,
      )
        ? reverseDictionary[word]
        : null;
      if (exactMatches && exactMatches.length > 0) {
        return { target: exactMatches[0], candidates: exactMatches };
      }
      return null;
    })();

    dictMatchCache.set(word, result);
    return result;
  }

  /**
   * 辞書に置換元と置換先の組み合わせを保存する（js/sidepanel.js から移植）
   */
  async function saveToDictionary(origin, target) {
    // プロトタイプ汚染を防ぐため予約キーを拒否（サイドパネル版と同じ）
    if (
      target === "__proto__" ||
      target === "constructor" ||
      target === "prototype"
    ) {
      console.warn(
        "Replace-Solo: Rejected saving reserved property key to dictionary:",
        target,
      );
      return;
    }
    if (
      !Object.prototype.hasOwnProperty.call(localDictionary, target) ||
      !Array.isArray(localDictionary[target])
    ) {
      localDictionary[target] = [];
    }
    if (!localDictionary[target].includes(origin)) {
      localDictionary[target].push(origin);
      updateDictCache();
      try {
        await chrome.storage.local.set({ dictionary: localDictionary });
      } catch (error) {
        console.error("Replace-Solo: Failed to save to dictionary:", error);
      }
    }
  }

  /**
   * 設定と辞書を chrome.storage.local から読み込む。
   * サイドパネル版と同じキーを使うため、辞書はそのまま共有される。
   */
  async function loadSettingsAndDictionary() {
    try {
      const result = await chrome.storage.local.get([
        "dictionary",
        "highlightEnabled",
        "preferJapanese",
      ]);
      if (result.dictionary) {
        localDictionary = result.dictionary;
      } else {
        localDictionary = DEFAULT_DICTIONARY;
        await chrome.storage.local.set({ dictionary: localDictionary });
      }
      highlightEnabled =
        typeof result.highlightEnabled === "boolean"
          ? result.highlightEnabled
          : false;
      preferJapanese =
        typeof result.preferJapanese === "boolean"
          ? result.preferJapanese
          : true;
    } catch (error) {
      console.error("Replace-Solo: Failed to load settings/dictionary:", error);
      localDictionary = DEFAULT_DICTIONARY;
      highlightEnabled = false;
      preferJapanese = true;
    }
    isJapaneseOnly = preferJapanese;
    updateDictCache();
    updateToggleUI();
  }

  // ===== kuromoji 初期化 =====

  /**
   * kuromoji の tokenizer を遅延初期化する。
   * 辞書パスは web_accessible_resources 経由で読み込めるよう、
   * chrome.runtime.getURL で拡張機能内の絶対URLを指定する。
   */
  function ensureTokenizer() {
    if (tokenizer) return Promise.resolve(tokenizer);
    if (tokenizerPromise) return tokenizerPromise;

    tokenizerPromise = new Promise((resolve) => {
      if (typeof kuromoji === "undefined") {
        console.error("Replace-Solo: kuromoji is not loaded");
        tokenizerPromise = null;
        resolve(null);
        return;
      }
      kuromoji
        .builder({ dicPath: chrome.runtime.getURL("lib/kuromoji/dict/") })
        .build((err, builtTokenizer) => {
          if (err) {
            console.error("Replace-Solo: kuromoji initialization error:", err);
            tokenizerPromise = null;
            resolve(null);
            return;
          }
          tokenizer = builtTokenizer;
          console.debug("Replace-Solo: kuromoji.js initialized (in-page)");
          resolve(tokenizer);
        });
    });
    return tokenizerPromise;
  }

  // ===== 名詞抽出（js/sidepanel.js の extractAndDisplay 中核を移植） =====

  /**
   * テキストから対象単語を抽出し、サイドパネル版と同じ並び順で返す
   * @param {string} text 抽出対象のテキスト
   * @returns {string[]} 対象単語の配列
   */
  function extractNouns(text) {
    const tokens = tokenizer.tokenize(text);
    const nouns = new Set();

    let i = 0;
    const tokenLen = tokens.length;
    while (i < tokenLen) {
      const token = tokens[i];

      // 開始トークンの判定条件
      const isNoun =
        token.pos === "名詞" && !EXCLUDED_NOUN_TYPES.has(token.pos_detail_1);
      const isPrefix = token.pos === "接頭詞";
      const isDictMatch = dictOrigins.has(token.surface_form);

      if (isDictMatch || isNoun || isPrefix) {
        let compound = token.surface_form;
        let hasProperNoun = token.pos_detail_1 === "固有名詞";
        let currentDictMatch = isDictMatch;
        let count = 1;

        let j = i + 1;
        while (j < tokenLen) {
          const nextToken = tokens[j];
          // 複合語の構成要素としては、非自立名詞等も許容する
          const nextIsNoun = nextToken.pos === "名詞";
          const nextIsDictMatch = dictOrigins.has(nextToken.surface_form);

          if (nextIsNoun || nextIsDictMatch) {
            compound += nextToken.surface_form;
            if (nextToken.pos_detail_1 === "固有名詞") hasProperNoun = true;
            if (nextIsDictMatch) currentDictMatch = true;
            count++;
            j++;
          } else {
            break;
          }
        }

        // 複合語全体で辞書にマッチするか確認
        if (!currentDictMatch && dictOrigins.has(compound)) {
          currentDictMatch = true;
        }

        // 前後の記号を除去
        const trimmedCompound = compound.replace(TRIM_SYMBOLS_REGEX, "");

        // トリム後の文字列でも辞書マッチを確認
        if (!currentDictMatch && dictOrigins.has(trimmedCompound)) {
          currentDictMatch = true;
        }

        // 採用条件（サイドパネル版と同じ）:
        // 1. 辞書に登録されている
        // 2. 日本語を含んでいる、かつ (固有名詞である OR 2つ以上の名詞が連続している)
        // 3. 日本語を含まないが、識別子として妥当であり、かつ (固有名詞である OR 2つ以上の名詞が連続している)
        const hasJapanese = JAPANESE_CHAR_REGEX.test(trimmedCompound);
        const isQualifiedIdentifier = IDENTIFIER_REGEX.test(trimmedCompound);
        const isQualified =
          currentDictMatch ||
          (trimmedCompound.length > 0 &&
            (hasJapanese || isQualifiedIdentifier) &&
            (hasProperNoun || count > 1));
        const isNotTooShort = currentDictMatch || trimmedCompound.length > 1;

        if (trimmedCompound && isQualified && isNotTooShort) {
          nouns.add(trimmedCompound);
        }
        i = j;
      } else {
        i++;
      }
    }

    const nounsWithMetadata = Array.from(nouns).map((word) => ({
      word,
      hasMatch: !!getDictMatch(word),
      hasJapanese: JAPANESE_CHAR_REGEX.test(word),
    }));

    // 辞書ヒット優先 → 日本語を含むものを優先 → 五十音順（サイドパネル版と同じ）
    nounsWithMetadata.sort((a, b) => {
      if (a.hasMatch && !b.hasMatch) return -1;
      if (!a.hasMatch && b.hasMatch) return 1;
      if (a.hasJapanese && !b.hasJapanese) return -1;
      if (!a.hasJapanese && b.hasJapanese) return 1;
      return JA_COLLATOR.compare(a.word, b.word);
    });

    return nounsWithMetadata.map((item) => item.word);
  }

  // ===== UI 構築（Shadow DOM） =====

  const CSS_TEXT = `
:host {
font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif;
}
.rs-launcher {
position: fixed;
right: 16px;
bottom: 88px;
z-index: 2147483000;
padding: 10px 16px;
border: none;
border-radius: 999px;
background: #0b57d0;
color: #ffffff;
font-size: 13px;
font-weight: 600;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
cursor: pointer;
}
.rs-launcher:hover {
background: #0842a0;
}
.rs-panel {
position: fixed;
right: 16px;
top: 56px;
z-index: 2147483000;
width: 360px;
max-width: calc(100vw - 32px);
max-height: calc(100vh - 72px);
display: flex;
flex-direction: column;
background: #ffffff;
color: #1f1f1f;
border-radius: 16px;
box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
font-size: 13px;
line-height: 1.5;
overflow: hidden;
}
.rs-panel[hidden] {
display: none;
}
.rs-header {
display: flex;
align-items: center;
justify-content: space-between;
padding: 10px 14px;
background: #f0f4f9;
border-bottom: 1px solid #e0e3e7;
}
.rs-title {
font-size: 14px;
font-weight: 600;
}
.rs-close {
border: none;
background: transparent;
font-size: 18px;
line-height: 1;
cursor: pointer;
color: #444746;
padding: 4px 8px;
}
.rs-actions {
display: flex;
gap: 8px;
padding: 10px 14px 4px;
}
.rs-btn {
flex: 1;
padding: 8px 10px;
border-radius: 999px;
border: 1px solid #747775;
background: #ffffff;
color: #0b57d0;
font-size: 13px;
font-weight: 600;
cursor: pointer;
}
.rs-btn-primary {
background: #0b57d0;
border-color: #0b57d0;
color: #ffffff;
}
.rs-btn:disabled {
opacity: 0.5;
cursor: default;
}
.rs-toggles {
display: flex;
gap: 8px;
padding: 10px 14px 0;
}
.rs-toggle {
flex: 1;
padding: 6px 10px;
border-radius: 999px;
border: 1px solid #747775;
background: #ffffff;
color: #444746;
font-size: 12px;
font-weight: 600;
cursor: pointer;
}
.rs-toggle.active {
background: #0b57d0;
border-color: #0b57d0;
color: #ffffff;
}
.rs-toggle-highlight.active {
background: #ccff90;
border-color: #99e633;
color: #1d1b20;
}
.rs-manual {
display: flex;
gap: 8px;
padding: 8px 14px 4px;
}
.rs-manual input {
flex: 1;
min-width: 0;
padding: 7px 10px;
border: 1px solid #c4c7c5;
border-radius: 8px;
font-size: 13px;
background: #ffffff;
color: #1f1f1f;
}
.rs-manual button {
flex: 0 0 auto;
}
.rs-status {
min-height: 1.5em;
padding: 4px 14px;
color: #444746;
font-size: 12px;
}
.rs-list {
overflow-y: auto;
border-top: 1px solid #e0e3e7;
}
.rs-row {
display: flex;
align-items: center;
gap: 6px;
padding: 6px 10px;
border-bottom: 1px solid #eef0f2;
}
.rs-origin {
flex: 0 1 32%;
word-break: break-all;
}
.rs-replace {
flex: 1;
min-width: 0;
padding: 6px 8px;
border: 1px solid #c4c7c5;
border-radius: 8px;
font-size: 13px;
background: #ffffff;
color: #1f1f1f;
}
.rs-dict-label {
display: flex;
align-items: center;
gap: 2px;
font-size: 11px;
color: #444746;
white-space: nowrap;
}
.rs-exec {
flex: 0 0 auto;
display: inline-flex;
align-items: center;
justify-content: center;
padding: 4px;
border: none;
border-radius: 999px;
background: transparent;
color: #0b57d0;
cursor: pointer;
}
.rs-exec:hover {
background: #e8f0fe;
}
.rs-modes {
display: flex;
gap: 4px;
padding: 10px 14px 0;
}
.rs-mode {
flex: 1;
padding: 6px 10px;
border-radius: 8px;
border: 1px solid #c4c7c5;
background: #f0f4f9;
color: #444746;
font-size: 12px;
font-weight: 600;
cursor: pointer;
}
.rs-mode.active {
background: #0b57d0;
border-color: #0b57d0;
color: #ffffff;
}
.rs-dict-section {
display: flex;
flex-direction: column;
min-height: 0;
flex: 1;
}
.rs-dict-section[hidden],
.rs-find-section[hidden] {
display: none;
}
.rs-find {
padding: 10px 14px 4px;
}
.rs-find-row {
display: flex;
align-items: center;
gap: 6px;
margin-bottom: 6px;
}
.rs-find-row[hidden] {
display: none;
}
.rs-find-input,
.rs-find-replace-input {
flex: 1;
min-width: 0;
padding: 7px 10px;
border: 1px solid #c4c7c5;
border-radius: 8px;
font-size: 13px;
background: #ffffff;
color: #1f1f1f;
}
.rs-find-count {
flex: 0 0 auto;
min-width: 52px;
text-align: center;
color: #444746;
font-size: 12px;
white-space: nowrap;
}
.rs-find-nav,
.rs-find-expand {
flex: 0 0 auto;
padding: 4px 8px;
border: 1px solid #c4c7c5;
border-radius: 8px;
background: #ffffff;
color: #0b57d0;
font-size: 13px;
font-weight: 600;
cursor: pointer;
}
.rs-find-opts {
display: flex;
gap: 6px;
}
.rs-find-opt {
padding: 4px 10px;
border-radius: 999px;
border: 1px solid #747775;
background: #ffffff;
color: #444746;
font-size: 12px;
font-weight: 600;
cursor: pointer;
}
.rs-find-opt.active {
background: #0b57d0;
border-color: #0b57d0;
color: #ffffff;
}
.rs-find-replace-row .rs-btn {
flex: 0 0 auto;
}
`;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  // ===== 設定トグル（サイドパネル版と storage キーを共有） =====

  function updateToggleUI() {
    if (highlightToggleEl) {
      highlightToggleEl.classList.toggle("active", highlightEnabled);
      highlightToggleEl.setAttribute(
        "aria-pressed",
        highlightEnabled ? "true" : "false",
      );
    }
    if (japaneseOnlyToggleEl) {
      japaneseOnlyToggleEl.classList.toggle("active", isJapaneseOnly);
      japaneseOnlyToggleEl.setAttribute(
        "aria-pressed",
        isJapaneseOnly ? "true" : "false",
      );
    }
  }

  // ハイライトの ON/OFF（サイドパネル版の highlight-toggle-btn と同じ挙動）
  async function handleHighlightToggle() {
    highlightEnabled = !highlightEnabled;
    try {
      await chrome.storage.local.set({ highlightEnabled });
    } catch (error) {
      console.error("Replace-Solo: Failed to save highlight setting:", error);
    }
    // OFF にしたら表示中のハイライトを消す（サイドパネル版と同じ）
    if (!highlightEnabled) {
      clearHighlight();
    }
    updateToggleUI();
  }

  // 「日本語のみ」の ON/OFF。
  // サイドパネル版の japanese-only-toggle-btn と同じく、保持している
  // 抽出済み単語から再描画する（ページからの再抽出はしない）。
  // 設定は preferJapanese として保存し、サイドパネル版と共有する。
  async function handleJapaneseOnlyToggle() {
    isJapaneseOnly = !isJapaneseOnly;
    preferJapanese = isJapaneseOnly;
    try {
      await chrome.storage.local.set({ preferJapanese });
    } catch (error) {
      console.error(
        "Replace-Solo: Failed to save preferJapanese setting:",
        error,
      );
    }
    updateToggleUI();
    clearHighlight();
    renderRows(lastExtractedWords);
    if (lastExtractedWords.length > 0) {
      setStatus(`${currentWords.size} 件の対象を表示しています。`);
    }
  }

  function createUI() {
    if (hostEl && hostEl.isConnected) return;

    hostEl = document.createElement("div");
    hostEl.id = "replace-solo-inpage-host";
    hostEl.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;";
    const shadow = hostEl.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = CSS_TEXT;
    shadow.appendChild(style);

    // 起動ボタン
    launcherEl = document.createElement("button");
    launcherEl.className = "rs-launcher";
    launcherEl.textContent = "Replace-Solo";
    launcherEl.title = "Replace-Solo パネル（Alt+Shift+R）";
    launcherEl.addEventListener("click", () => togglePanel());
    shadow.appendChild(launcherEl);

    // パネル本体（静的な枠組みのみ。単語などのデータは DOM API で設定する）
    panelEl = document.createElement("div");
    panelEl.className = "rs-panel";
    panelEl.hidden = !panelOpen;
    panelEl.innerHTML = `
<div class="rs-header">
<span class="rs-title">Replace-Solo（ページ内パネル）</span>
<button class="rs-close" aria-label="閉じる">×</button>
</div>
<div class="rs-modes">
<button class="rs-mode rs-mode-dict active">辞書置換</button>
<button class="rs-mode rs-mode-find">検索と置換</button>
</div>
<div class="rs-dict-section">
<div class="rs-toggles">
<button class="rs-toggle rs-toggle-highlight" aria-pressed="false" title="ハイライト">ハイライト</button>
<button class="rs-toggle rs-toggle-jaonly" aria-pressed="true" title="日本語のみ">日本語のみ</button>
</div>
<div class="rs-actions">
<button class="rs-btn rs-extract">対象抽出</button>
<button class="rs-btn rs-btn-primary rs-replace-all">一括置換</button>
</div>
<div class="rs-manual">
<input class="rs-manual-input" type="text" placeholder="対象を手動追加">
<button class="rs-btn rs-manual-add" style="flex:0 0 auto;">追加</button>
</div>
<div class="rs-status"></div>
<div class="rs-list"></div>
</div>
<div class="rs-find-section" hidden>
<div class="rs-find">
<div class="rs-find-row">
<button class="rs-find-expand" title="置換を表示" aria-expanded="false">›</button>
<input class="rs-find-input" type="text" placeholder="検索" aria-label="検索文字列">
<span class="rs-find-count"></span>
<button class="rs-find-nav rs-find-prev" title="前へ (Shift+Enter)">↑</button>
<button class="rs-find-nav rs-find-next" title="次へ (Enter)">↓</button>
</div>
<div class="rs-find-row rs-find-replace-row" hidden>
<input class="rs-find-replace-input" type="text" placeholder="置換" aria-label="置換文字列">
<button class="rs-btn rs-find-replace-one">置換</button>
<button class="rs-btn rs-find-replace-all-btn">すべて置換</button>
</div>
<div class="rs-find-opts">
<button class="rs-find-opt rs-find-case" aria-pressed="false" title="大文字と小文字を区別">Aa</button>
<button class="rs-find-opt rs-find-regex" aria-pressed="false" title="正規表現">.*</button>
</div>
</div>
<div class="rs-status rs-find-status"></div>
</div>
`;
    shadow.appendChild(panelEl);

    listEl = panelEl.querySelector(".rs-list");
    statusEl = panelEl.querySelector(".rs-status");
    manualInputEl = panelEl.querySelector(".rs-manual-input");
    highlightToggleEl = panelEl.querySelector(".rs-toggle-highlight");
    japaneseOnlyToggleEl = panelEl.querySelector(".rs-toggle-jaonly");
    highlightToggleEl.addEventListener("click", handleHighlightToggle);
    japaneseOnlyToggleEl.addEventListener("click", handleJapaneseOnlyToggle);
    updateToggleUI();

    panelEl
      .querySelector(".rs-close")
      .addEventListener("click", () => togglePanel(false));
    panelEl
      .querySelector(".rs-extract")
      .addEventListener("click", handleExtract);
    panelEl
      .querySelector(".rs-replace-all")
      .addEventListener("click", handleReplaceAll);
    panelEl
      .querySelector(".rs-manual-add")
      .addEventListener("click", handleManualAdd);
    manualInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        handleManualAdd();
      }
    });

    // 検索モードの配線
    dictSectionEl = panelEl.querySelector(".rs-dict-section");
    findSectionEl = panelEl.querySelector(".rs-find-section");
    modeDictBtnEl = panelEl.querySelector(".rs-mode-dict");
    modeFindBtnEl = panelEl.querySelector(".rs-mode-find");
    findInputEl = panelEl.querySelector(".rs-find-input");
    findCountEl = panelEl.querySelector(".rs-find-count");
    findReplaceRowEl = panelEl.querySelector(".rs-find-replace-row");
    findReplaceInputEl = panelEl.querySelector(".rs-find-replace-input");
    findStatusEl = panelEl.querySelector(".rs-find-status");
    findCaseToggleEl = panelEl.querySelector(".rs-find-case");
    findRegexToggleEl = panelEl.querySelector(".rs-find-regex");
    modeDictBtnEl.addEventListener("click", () => switchMode("dict"));
    modeFindBtnEl.addEventListener("click", () => switchMode("find"));
    findInputEl.addEventListener("input", handleFindInput);
    findInputEl.addEventListener("keydown", handleFindKeydown);
    panelEl
      .querySelector(".rs-find-prev")
      .addEventListener("click", () => handleFindNavigate(-1));
    panelEl
      .querySelector(".rs-find-next")
      .addEventListener("click", () => handleFindNavigate(1));
    panelEl
      .querySelector(".rs-find-expand")
      .addEventListener("click", handleFindExpandToggle);
    panelEl
      .querySelector(".rs-find-replace-one")
      .addEventListener("click", handleFindReplaceOne);
    panelEl
      .querySelector(".rs-find-replace-all-btn")
      .addEventListener("click", handleFindReplaceAll);
    findCaseToggleEl.addEventListener("click", () =>
      handleFindOptionToggle("case"),
    );
    findRegexToggleEl.addEventListener("click", () =>
      handleFindOptionToggle("regex"),
    );
    findReplaceInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        handleFindReplaceOne();
      }
    });

    // パネル内のキー入力が Loop 側のショートカットに漏れないようにする
    panelEl.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });

    document.documentElement.appendChild(hostEl);
  }

  function removeUI() {
    if (hostEl) {
      hostEl.remove();
    }
    hostEl = null;
    launcherEl = null;
    panelEl = null;
    listEl = null;
    statusEl = null;
    manualInputEl = null;
    highlightToggleEl = null;
    japaneseOnlyToggleEl = null;
    panelOpen = false;
    dictSectionEl = null;
    findSectionEl = null;
    modeDictBtnEl = null;
    modeFindBtnEl = null;
    findInputEl = null;
    findCountEl = null;
    findReplaceRowEl = null;
    findReplaceInputEl = null;
    findStatusEl = null;
    findCaseToggleEl = null;
    findRegexToggleEl = null;
    panelMode = "dict";
    findReplaceExpanded = false;
    findLastQuery = "";
    if (findDebounceTimer) {
      clearTimeout(findDebounceTimer);
      findDebounceTimer = null;
    }
    currentWords.clear();
    lastExtractedWords = [];
  }

  async function togglePanel(force) {
    panelOpen = typeof force === "boolean" ? force : !panelOpen;
    if (!hostEl || !hostEl.isConnected) createUI();
    if (panelEl) panelEl.hidden = !panelOpen;
    if (panelOpen) {
      // 開くたびに最新の辞書を読み直す（サイドパネル側の変更を反映するため）
      await loadSettingsAndDictionary();
      // 一覧が空のときは、開いたタイミングで自動的に対象抽出する。
      // 一覧があるときは再抽出しない（編集中の置換文字列入力を保持するため）
      if (currentWords.size === 0) {
        await handleExtract();
      }
      // 検索モードで開いた場合、ページの状態に合わせて検索し直す
      if (panelMode === "find" && findInputEl && findInputEl.value) {
        runFind();
      }
    } else {
      // パネルを閉じたら検索ハイライトをページに残さない
      clearFindMatches();
    }
  }

  // ===== 行の生成（js/sidepanel.js の createWordRow を移植・簡略化） =====

  function createWordRow(word, isManual = false) {
    if (currentWords.has(word)) return null;

    const hasJapanese = JAPANESE_CHAR_REGEX.test(word);
    const isDictMatch = dictOrigins.has(word);
    const isManualInternal = isManual || manualWords.has(word);

    if (isJapaneseOnly && !hasJapanese && !isDictMatch && !isManualInternal) {
      // 辞書外の英単語等はスキップ。ただし手動追加は常に表示（サイドパネル版と同じ）
      return null;
    }

    currentWords.add(word);
    const dictMatch = getDictMatch(word);

    const row = document.createElement("div");
    row.className = "rs-row";

    // 選択チェックボックス（辞書マッチ時は初期ON）
    const applyCheck = document.createElement("input");
    applyCheck.type = "checkbox";
    applyCheck.className = "rs-apply";
    applyCheck.setAttribute("aria-label", `「${word}」を置換対象として選択`);
    if (dictMatch) applyCheck.checked = true;
    row.appendChild(applyCheck);

    // 対象単語
    const spanOrigin = document.createElement("span");
    spanOrigin.className = "rs-origin";
    spanOrigin.textContent = word;
    row.appendChild(spanOrigin);

    // 置換文字列入力（辞書マッチ時はその値を初期表示、候補は datalist で提示）
    const replaceInput = document.createElement("input");
    replaceInput.type = "text";
    replaceInput.className = "rs-replace";
    replaceInput.setAttribute("aria-label", `「${word}」の置換文字列`);
    replaceInput.value = dictMatch ? dictMatch.target : "";
    const datalistId = `rs-dict-${Math.random().toString(36).slice(2, 9)}`;
    replaceInput.setAttribute("list", datalistId);
    const datalist = document.createElement("datalist");
    datalist.id = datalistId;
    if (dictMatch) {
      dictMatch.candidates.forEach((c) => {
        const option = document.createElement("option");
        option.value = c;
        datalist.appendChild(option);
      });
    }
    row.appendChild(replaceInput);
    row.appendChild(datalist);

    // 辞書登録チェックボックス
    const dictLabel = document.createElement("label");
    dictLabel.className = "rs-dict-label";
    const dictCheck = document.createElement("input");
    dictCheck.type = "checkbox";
    dictCheck.className = "rs-dict";
    dictCheck.setAttribute("aria-label", `「${word}」の置換設定を辞書に登録`);
    dictLabel.appendChild(dictCheck);
    dictLabel.appendChild(document.createTextNode("辞書"));
    row.appendChild(dictLabel);

    if (dictMatch && dictMatch.candidates.includes(replaceInput.value)) {
      dictCheck.disabled = true;
    }

    // 置換文字列が入力されたら選択をONにする（サイドパネル版と同じ挙動）
    replaceInput.addEventListener("input", () => {
      const val = replaceInput.value;
      applyCheck.checked = true;
      const currentCandidates = dictMatch ? dictMatch.candidates : [];
      if (currentCandidates.includes(val)) {
        dictCheck.checked = false;
        dictCheck.disabled = true;
      } else {
        dictCheck.disabled = false;
      }
    });

    // 単体置換ボタン（サイドパネル版と同じ SVG アイコンボタン）
    const execBtn = document.createElement("button");
    execBtn.className = "rs-exec";
    execBtn.title = "置換";
    execBtn.setAttribute("aria-label", `「${word}」を個別置換`);
    const svgExec = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    svgExec.setAttribute("height", "24px");
    svgExec.setAttribute("viewBox", "0 -960 960 960");
    svgExec.setAttribute("width", "24px");
    svgExec.setAttribute("fill", "currentColor");
    const pathExec = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    pathExec.setAttribute("d", "M320-200v-560l440 280-440 280Z");
    svgExec.appendChild(pathExec);
    execBtn.appendChild(svgExec);
    execBtn.addEventListener("click", () => {
      const target = replaceInput.value;
      clearHighlight();
      replaceByEmulationBatch([{ origin: word, target }]);
      if (dictCheck.checked && !dictCheck.disabled) {
        saveToDictionary(word, target);
        dictCheck.disabled = true;
      }
    });
    row.appendChild(execBtn);

    // ホバーでページ側をハイライト（設定がONのときのみ、サイドパネル版と同じ）
    row.addEventListener("mouseenter", () => {
      if (highlightEnabled) highlightWord(word);
    });
    row.addEventListener("mouseleave", () => {
      if (highlightEnabled) clearHighlight();
    });

    return row;
  }

  function renderRows(words) {
    listEl.textContent = "";
    currentWords.clear();
    const fragment = document.createDocumentFragment();
    for (const word of words) {
      const row = createWordRow(word, false);
      if (row) fragment.appendChild(row);
    }
    listEl.appendChild(fragment);
  }

  // ===== 操作ハンドラ =====

  async function handleExtract() {
    setStatus("抽出中…");
    try {
      await loadSettingsAndDictionary();
      const built = await ensureTokenizer();
      if (!built) {
        setStatus("形態素解析エンジンの準備に失敗しました。");
        return;
      }
      const root = getTargetRoot();
      const text = getEditableInnerText(root);
      if (!text) {
        lastExtractedWords = [];
        renderRows([]);
        setStatus("抽出できるテキストが見つかりませんでした。");
        return;
      }
      const words = extractNouns(text);
      lastExtractedWords = words;
      renderRows(words);
      setStatus(`${currentWords.size} 件の対象を表示しています。`);
    } catch (error) {
      console.error("Replace-Solo: Extraction failed (in-page):", error);
      setStatus("抽出に失敗しました。");
    }
  }

  function handleReplaceAll() {
    if (!listEl) return;
    const rows = listEl.querySelectorAll(".rs-row");
    const replacements = [];

    rows.forEach((row) => {
      const applyCheck = row.querySelector(".rs-apply");
      if (!applyCheck || !applyCheck.checked) return;
      const origin = row.querySelector(".rs-origin").textContent;
      const target = row.querySelector(".rs-replace").value;
      const dictCheck = row.querySelector(".rs-dict");

      replacements.push({ origin, target });

      if (dictCheck && dictCheck.checked && !dictCheck.disabled) {
        saveToDictionary(origin, target);
        dictCheck.disabled = true;
      }
    });

    if (replacements.length === 0) {
      setStatus("置換対象が選択されていません。");
      return;
    }

    clearHighlight();
    // content.js の REPLACE_WORDS ハンドラと同じ形の配列を直接渡す
    replaceByEmulationBatch(replacements);
    setStatus(`${replacements.length} 件の置換を実行しました。`);
  }

  function handleManualAdd() {
    const word = manualInputEl.value.trim();
    if (!word) return;
    if (currentWords.has(word)) {
      setStatus(`「${word}」は既にリストにあります。`);
      manualInputEl.value = "";
      return;
    }
    manualWords.add(word);
    // 「日本語のみ」切替時の再描画でも残るよう、抽出済み単語にも加える
    // （サイドパネル版が allExtractedWords へ追加するのと同じ）
    if (!lastExtractedWords.includes(word)) {
      lastExtractedWords.push(word);
    }
    const row = createWordRow(word, true);
    if (row) {
      listEl.prepend(row);
      const applyCheck = row.querySelector(".rs-apply");
      if (applyCheck) applyCheck.checked = true;
    }
    manualInputEl.value = "";
  }

  // ===== 検索モード =====
  //
  // 通常は検索のみ（入力すると一致がハイライトされ、件数が表示される）。
  // 置換したいときだけ、展開ボタン（›）で置換欄を開く（VS Code の検索ウィジェットと同じ考え方）。
  // 一致の収集・ハイライト・置換の実処理は content.js 側の関数が担う。

  function setFindStatus(message) {
    if (findStatusEl) findStatusEl.textContent = message;
  }

  function updateFindCount(state) {
    if (!findCountEl) return;
    if (state.error) {
      findCountEl.textContent = "";
      setFindStatus(state.error);
      return;
    }
    if (!findInputEl || !findInputEl.value) {
      findCountEl.textContent = "";
      return;
    }
    if (state.count === 0) {
      findCountEl.textContent = "結果なし";
      return;
    }
    findCountEl.textContent = `${state.currentIndex + 1} / ${state.count}`;
  }

  function runFind() {
    if (!findInputEl) return;
    findLastQuery = findInputEl.value;
    const state = findInPage(findInputEl.value, {
      caseSensitive:
        !!findCaseToggleEl && findCaseToggleEl.classList.contains("active"),
      useRegex:
        !!findRegexToggleEl && findRegexToggleEl.classList.contains("active"),
    });
    setFindStatus("");
    updateFindCount(state);
  }

  function handleFindInput() {
    if (findDebounceTimer) clearTimeout(findDebounceTimer);
    findDebounceTimer = setTimeout(runFind, 200);
  }

  function handleFindKeydown(e) {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      handleFindNavigate(e.shiftKey ? -1 : 1);
    }
  }

  function handleFindNavigate(delta) {
    if (!findInputEl) return;
    // 入力したのにまだ検索が走っていない場合は、移動ではなく検索を先に行う
    if (findInputEl.value !== findLastQuery) {
      runFind();
      return;
    }
    const state = navigateFindMatches(delta);
    updateFindCount(state);
  }

  function handleFindExpandToggle() {
    findReplaceExpanded = !findReplaceExpanded;
    if (findReplaceRowEl) findReplaceRowEl.hidden = !findReplaceExpanded;
    const btn = panelEl ? panelEl.querySelector(".rs-find-expand") : null;
    if (btn) {
      btn.textContent = findReplaceExpanded ? "‹" : "›";
      btn.setAttribute(
        "aria-expanded",
        findReplaceExpanded ? "true" : "false",
      );
      btn.title = findReplaceExpanded ? "置換を隠す" : "置換を表示";
    }
    if (findReplaceExpanded && findReplaceInputEl) {
      findReplaceInputEl.focus();
    }
  }

  function handleFindReplaceOne() {
    if (!findReplaceInputEl) return;
    const result = replaceCurrentFindMatch(findReplaceInputEl.value);
    if (!result.replaced) {
      setFindStatus("置換できる一致がありません。");
      return;
    }
    updateFindCount(result);
    setFindStatus("1件を置換しました。");
    // 続けて置換できるよう、フォーカスを置換欄に戻す
    findReplaceInputEl.focus();
  }

  function handleFindReplaceAll() {
    if (!findReplaceInputEl) return;
    const result = replaceAllFindMatches(findReplaceInputEl.value);
    if (result.replacedCount === 0) {
      setFindStatus("置換できる一致がありません。");
      return;
    }
    updateFindCount(result);
    setFindStatus(`${result.replacedCount} 件を置換しました。`);
    findReplaceInputEl.focus();
  }

  function handleFindOptionToggle(kind) {
    const el = kind === "case" ? findCaseToggleEl : findRegexToggleEl;
    if (!el) return;
    el.classList.toggle("active");
    el.setAttribute(
      "aria-pressed",
      el.classList.contains("active") ? "true" : "false",
    );
    runFind();
  }

  function switchMode(mode) {
    panelMode = mode;
    const isFind = mode === "find";
    if (dictSectionEl) dictSectionEl.hidden = isFind;
    if (findSectionEl) findSectionEl.hidden = !isFind;
    if (modeDictBtnEl) modeDictBtnEl.classList.toggle("active", !isFind);
    if (modeFindBtnEl) modeFindBtnEl.classList.toggle("active", isFind);
    if (isFind) {
      // ページ側の状態が変わっている可能性があるため、検索語があれば検索し直す
      if (findInputEl && findInputEl.value) runFind();
      if (findInputEl) findInputEl.focus();
    } else {
      // 辞書モードへ戻るときは検索ハイライトを消す
      clearFindMatches();
      findLastQuery = "";
      if (findCountEl) findCountEl.textContent = "";
      setFindStatus("");
    }
  }

  // ===== SPA 対応: /p/ ページでのみ UI を有効化 =====

  function isTargetPage() {
    return location.pathname.startsWith("/p/");
  }

  function syncUI() {
    if (isTargetPage()) {
      if (!hostEl || !hostEl.isConnected) {
        createUI();
      }
    } else if (hostEl) {
      removeUI();
    }
  }

  // Loop は SPA のため、定期チェックで遷移に追従する
  setInterval(syncUI, 1000);
  syncUI();

  // 起動直後に辞書を読み込んでおく
  loadSettingsAndDictionary();

  // ===== キーボードショートカット: Alt+Shift+R でパネルの開閉 =====

  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.altKey &&
        e.shiftKey &&
        e.code === "KeyR" &&
        !e.isComposing &&
        isTargetPage()
      ) {
        e.preventDefault();
        togglePanel();
      }
    },
    true,
  );
})();
