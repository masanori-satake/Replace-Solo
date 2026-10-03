/**
 * Replace-Solo Content Script
 * Responsible for text extraction and replacement in the active tab.
 */

console.debug("Replace-Solo: Content script injected");

if (typeof window.replaceSoloLoaded === "undefined") {
  window.replaceSoloLoaded = true;
  setupMessageListener();
}

/**
 * Register the message listener once.
 */
function setupMessageListener() {
  if (window.replaceSoloListenerRegistered) return;
  if (
    typeof chrome === "undefined" ||
    !chrome.runtime ||
    !chrome.runtime.onMessage
  )
    return;
  window.replaceSoloListenerRegistered = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PING") {
      sendResponse({ pong: true });
      return true;
    }

    if (request.action === "EXTRACT_TEXT") {
      const root = getTargetRoot();
      const text = getEditableInnerText(root);
      sendResponse({ text: text });
      return true;
    }

    if (request.action === "REPLACE_WORDS") {
      const { replacements } = request;
      // Microsoft Loopに特化し、入力エミュレーションのみをサポート
      replaceByEmulationBatch(replacements);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "HIGHLIGHT_WORD") {
      highlightWord(request.word);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "CLEAR_HIGHLIGHT") {
      clearHighlight();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "INSERT_COPILOT_PROMPT_TOGGLE") {
      const { markdownPrompt, promptText } = request;
      const success = insertCopilotPromptToggle(markdownPrompt, promptText);
      sendResponse({ success });
      return true;
    }
  });
}

/**
 * タイトル直下の本文エリアを特定する
 */
function findTargetBlockAfterTitle() {
  const root = getTargetRoot();

  // タイトル要素の候補セレクタ
  const titleSelectors = [
    '[data-data-id="page-title"]',
    'h1[contenteditable="true"]',
    '.lc-titleEditor [contenteditable="true"]',
    ".scriptor-pageTitle",
    ".scriptor-title",
  ];

  let titleElem = null;
  for (const sel of titleSelectors) {
    const el = root.querySelector(sel) || document.querySelector(sel);
    if (el) {
      titleElem = el;
      break;
    }
  }

  const isOutsideTitle = (el) => {
    if (!el || !titleElem) return true;
    return !titleElem.contains(el) && !el.contains(titleElem);
  };

  if (titleElem) {
    // タイトル要素の親コンテナまたはタイトル自体の次の兄弟・子要素から本文ブロックを探す
    let container = titleElem.closest(
      ".scriptor-canvas-grid-layout, .scriptor-canvas, .lc-canvas, body",
    );
    if (!container) container = root;

    // タイトル直後の最初のブロック要素
    const candidateBlocks = container.querySelectorAll(
      '.lc-canvas-body > :first-child, .scriptor-pageBody > :first-child, .scriptor-paragraph, [contenteditable="true"]:not([data-data-id="page-title"]):not(h1)',
    );

    for (const block of candidateBlocks) {
      if (isOutsideTitle(block)) {
        return { titleElem, targetBlock: block };
      }
    }
  }

  // フォールバック: ページ内の最初の編集可能ブロック（タイトルを除く）
  const fallbackCandidates = root.querySelectorAll(
    '.scriptor-paragraph, .scriptor-pageBody > div, [contenteditable="true"]',
  );

  for (const block of fallbackCandidates) {
    if (isOutsideTitle(block)) {
      return { titleElem, targetBlock: block };
    }
  }

  return { titleElem, targetBlock: isOutsideTitle(root) ? root : null };
}

/**
 * Microsoft Loopページのタイトル直下にトグル（折りたたみ）ブロックとしてプロンプトを挿入する
 */
function insertCopilotPromptToggle(markdownPrompt, promptText) {
  const { targetBlock } = findTargetBlockAfterTitle();

  if (!targetBlock) {
    console.error("Replace-Solo: Target block for prompt insertion not found.");
    return false;
  }

  window.focus();

  // クリップボード/模擬入力による挿入（推奨アルゴリズム）
  let editableElem = targetBlock;
  if (!editableElem.isContentEditable) {
    editableElem =
      targetBlock.querySelector('[contenteditable="true"]') ||
      targetBlock.closest('[contenteditable="true"]');
  }

  if (editableElem && editableElem.isContentEditable) {
    try {
      editableElem.focus({ preventScroll: true });

      // トークン・行末の挿入準備（先頭にカーソルを合わせる）
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editableElem);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      const beforeInputEvent = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: markdownPrompt + "\n",
        composed: true,
        isComposing: false,
      });
      editableElem.dispatchEvent(beforeInputEvent);

      const execSuccess = document.execCommand(
        "insertText",
        false,
        markdownPrompt + "\n",
      );

      const inputEvent = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: markdownPrompt + "\n",
        composed: true,
        isComposing: false,
      });
      editableElem.dispatchEvent(inputEvent);

      if (execSuccess) {
        console.debug(
          "Replace-Solo: Successfully inserted prompt via input emulation.",
        );
        return true;
      }
    } catch (e) {
      console.warn(
        "Replace-Solo: Input emulation failed for prompt toggle, falling back to direct DOM insertion.",
        e,
      );
    }
  }

  // フォールバック: 直接 DOM 挿入 (<details><summary> タグ)
  try {
    const details = document.createElement("details");
    details.className = "replace-solo-prompt-toggle";
    details.style.margin = "12px 0";
    details.style.padding = "8px 12px";
    details.style.border = "1px solid #d1d5db";
    details.style.borderRadius = "6px";
    details.style.backgroundColor = "#f9fafb";

    const lines = (promptText || "").split("\n");
    const summaryText = lines[0] || "🔽 【Facilitatorへの指示・用語定義】";
    const bodyText = lines.slice(1).join("\n");

    const summary = document.createElement("summary");
    summary.style.fontWeight = "bold";
    summary.style.cursor = "pointer";
    summary.textContent = summaryText;
    details.appendChild(summary);

    const bodyPre = document.createElement("pre");
    bodyPre.style.whiteSpace = "pre-wrap";
    bodyPre.style.marginTop = "8px";
    bodyPre.style.fontFamily = "inherit";
    bodyPre.style.fontSize = "14px";
    bodyPre.textContent = bodyText;
    details.appendChild(bodyPre);

    if (targetBlock.parentNode) {
      targetBlock.parentNode.insertBefore(details, targetBlock);
    } else {
      targetBlock.appendChild(details);
    }

    console.debug(
      "Replace-Solo: Successfully inserted prompt via direct DOM fallback.",
    );
    return true;
  } catch (domErr) {
    console.error("Replace-Solo: Direct DOM insertion failed.", domErr);
    return false;
  }
}

/**
 * CSS Custom Highlight API用のスタイルを注入する
 */
function ensureHighlightStyle() {
  if (document.getElementById("replace-solo-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "replace-solo-highlight-style";
  style.textContent = `
    ::highlight(replace-solo-target) {
      background-color: #ccff90;
      color: #000000;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Loopページ内の該当文字列をハイライト表示する
 */
function highlightWord(targetText) {
  clearHighlight();
  if (!targetText) return;

  const root = getTargetRoot();
  const ranges = findRangesAcrossNodes(root, [{ origin: targetText }]);

  if (ranges.length === 0) return;

  if (typeof CSS !== "undefined" && CSS.highlights) {
    ensureHighlightStyle();
    const validRanges = ranges
      .map((item) => item.range)
      .filter(
        (r) => r.startContainer.isConnected && r.endContainer.isConnected,
      );
    if (validRanges.length > 0) {
      const highlight = new Highlight(...validRanges);
      CSS.highlights.set("replace-solo-target", highlight);
    }
  } else {
    // CSS Custom Highlight API非対応ブラウザへのフォールバック（DOM直接変更は避け安全にスキップ）
    console.warn("Replace-Solo: CSS Custom Highlight API is not supported.");
  }
}

/**
 * Loopページ内のハイライト表示を解除する
 */
function clearHighlight() {
  if (typeof CSS !== "undefined" && CSS.highlights) {
    CSS.highlights.delete("replace-solo-target");
  }

  // 旧方式で生成された要素が万が一残っている場合のフォールバック掃除
  const highlights = document.querySelectorAll(".replace-solo-highlight");
  highlights.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;

    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
    parent.normalize();
  });
}

/**
 * 置換・抽出対象のルート要素を取得する
 */
function getTargetRoot() {
  const hostname = window.location.hostname;
  // サブドメインの変動に備え endsWith で判定
  const isLoop =
    hostname.endsWith("loop.microsoft.com") ||
    hostname.endsWith("loop.cloud.microsoft");

  if (isLoop) {
    // Loopのメインコンテンツ（タイトルと本文）を包む要素を優先的に探す
    // .scriptor-canvas-grid-layout は通常、タイトルエリアと本文エリアの両方を包含する
    const mainCanvas = document.querySelector(
      ".scriptor-canvas.scriptor-canvas-grid-layout",
    );
    if (mainCanvas) return mainCanvas;

    // 個別の .scriptor-canvas がある場合（古い構成や特殊なページなど）
    // 最初の canvas がメインエリアである可能性が高い
    const firstCanvas = document.querySelector(".scriptor-canvas");
    if (firstCanvas) return firstCanvas;

    // 従来のセレクタ（ライブピルポータルアンカーの次）
    const anchor = document.getElementById("livepill-portal-anchor");
    if (anchor && anchor.nextElementSibling) {
      return anchor.nextElementSibling;
    }
  }
  return document.body;
}

const ENTITY_DATA_ATTRIBUTES = [
  "data-entity-id",
  "data-mention-id",
  "data-user-id",
  "data-tag-id",
  "data-component-type",
];

/**
 * テキストノードが安全なプレーンテキストノードかどうか判定する
 */
function isSafeTextNode(node, editorRoot) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  if (!node.nodeValue) return false;

  let current = node.parentElement;

  while (current && current !== editorRoot && current !== document.body) {
    // 条件1: contenteditable="false" のアトミックノード配下
    if (current.getAttribute("contenteditable") === "false") {
      return false;
    }

    // 条件2: 特定のエンティティ専用データ属性を保持しているか
    const hasEntityAttribute = ENTITY_DATA_ATTRIBUTES.some((attr) =>
      current.hasAttribute(attr),
    );
    if (hasEntityAttribute) {
      return false;
    }

    // 条件3: ボタンやバッジとして動作するARIA/Role属性、またはボタン・UI要素
    const role = current.getAttribute("role");
    if (role && ["button", "option", "combobox", "dialog"].includes(role)) {
      return false;
    }

    if (
      current.tagName === "BUTTON" ||
      (current.tagName === "BR" && current.classList.contains("scriptor-EOP"))
    ) {
      return false;
    }

    if (isLoopUIElement(current)) {
      return false;
    }

    // 条件4: カスタムエレメント（タグ名にハイフン含む）
    if (current.tagName && current.tagName.includes("-")) {
      return false;
    }

    current = current.parentElement;
  }

  return true;
}

/**
 * 安全なテキストノードを収集する
 */
function getSafeTextNodes(root) {
  if (!root) return [];
  const safeNodes = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (isNodeEditable(node) && isSafeTextNode(node, root)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    },
    false,
  );

  let node;
  while ((node = walker.nextNode())) {
    safeNodes.push(node);
  }

  return safeNodes;
}

/**
 * ノードが編集可能（ユーザーが入力を想定している箇所）かどうかを判定する
 */
function isNodeEditable(node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element) return false;

  const tag = element.tagName.toUpperCase();
  if (tag === "SCRIPT" || tag === "STYLE") return false;

  // 特定の非表示・不要な要素（LoopのUIパーツなど）を除外
  if (isLoopUIElement(element)) return false;

  // contenteditable または role="textbox" を持っている要素内か判定
  return element.isContentEditable || !!element.closest('[role="textbox"]');
}

/**
 * 編集可能かつ安全なノードからのみテキストを抽出する
 */
function getEditableInnerText(root) {
  const safeNodes = getSafeTextNodes(root);
  if (safeNodes.length === 0) return "";

  const chunks = [];
  let lastContainer = null;
  let lastParent = null;

  safeNodes.forEach((node) => {
    const parent = node.parentElement;
    let currentContainer = lastContainer;
    if (parent !== lastParent) {
      currentContainer = parent?.closest(
        '.scriptor-paragraph, .scriptor-pageBody > div, [contenteditable="true"], [role="textbox"]',
      );
      if (
        lastContainer &&
        currentContainer &&
        currentContainer !== lastContainer
      ) {
        chunks.push("\n");
      }
      lastParent = parent;
      lastContainer = currentContainer;
    }
    chunks.push(node.nodeValue);
  });

  return chunks.join("");
}

/**
 * LoopのUI要素かどうか判定する
 */
function isLoopUIElement(el) {
  if (!el || !el.closest) return false;
  return !!el.closest(
    ".scriptor-blocks-commands-hover, .scriptor-blocks-commands-wrapper, .BlockUI, .ContentAddition",
  );
}

/**
 * 複数のテキストノードに跨る可能性がある文字列を検索し、Rangeのリストを返す
 */
function findRangesAcrossNodes(root, replacements) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (isNodeEditable(node) && isSafeTextNode(node, root)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    },
    false,
  );

  let combinedText = "";
  const nodeInfo = []; // { start: number, end: number, node: TextNode, container: Element }

  let node;
  let lastParent = null;
  let lastContainer = null;

  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    if (text.length === 0) continue;

    // 編集可能なコンテナが変わった場合（例: 別のリストアイテムや段落に移動した場合）、
    // インデックスの整合性を保ち、意図しない跨ぎ一致を防ぐためにセパレータを入れる。
    // 親要素が変わったときだけ closest を呼び出すことで、ドキュメント走査時のパフォーマンスを改善する。
    const parent = node.parentElement;
    let currentContainer = lastContainer;
    if (parent !== lastParent) {
      currentContainer = parent?.closest(
        '.scriptor-paragraph, .scriptor-pageBody > div, [contenteditable="true"], [role="textbox"]',
      );
      if (
        lastContainer &&
        currentContainer &&
        currentContainer !== lastContainer
      ) {
        combinedText += "\n";
      }
      lastParent = parent;
      lastContainer = currentContainer;
    }

    nodeInfo.push({
      start: combinedText.length,
      end: combinedText.length + text.length,
      node: node,
      container: currentContainer,
    });
    combinedText += text;
  }

  const allReplacementRanges = [];

  replacements.forEach(({ origin, target }) => {
    if (typeof origin !== "string" || !origin) return;

    // スペースや改行、タブなどの空白文字の連続を考慮した正規表現を作成
    // origin の構成文字を1文字ずつ分割し、その間に空白許容パターンを入れる。
    // origin が "手順１" の場合、"手\s*順\s*１" となる。
    // \s は [ \f\n\r\t\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff] を含むため、これを使用する。
    const chars = Array.from(origin);
    const regexSource = chars
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\s\\n\\r\\t]*");
    const regex = new RegExp(regexSource, "g");

    let match;
    while ((match = regex.exec(combinedText)) !== null) {
      const range = document.createRange();
      const startPos = match.index;
      const endPos = match.index + match[0].length;

      // 開始位置と終了位置に対応するノードをバイナリサーチで特定
      const findNodeData = (pos, isEnd) => {
        let low = 0,
          high = nodeInfo.length - 1;
        while (low <= high) {
          const mid = (low + high) >> 1;
          const info = nodeInfo[mid];
          // 境界条件の厳密化
          // 開始位置(isEnd=false)の場合、そのノードの範囲内に pos が含まれる必要がある [start, end)
          // 終了位置(isEnd=true)の場合、そのノードの範囲内に pos が含まれる必要がある (start, end]
          // これにより、ノード境界（あるノードの末尾かつ次のノードの先頭）で正しいノードが選択される。
          if (isEnd) {
            if (pos > info.start && pos <= info.end) {
              return info;
            }
          } else {
            if (pos >= info.start && pos < info.end) {
              return info;
            }
          }

          if (pos <= info.start) high = mid - 1;
          else low = mid + 1;
        }
        return null;
      };

      const startNodeData = findNodeData(startPos, false);
      const endNodeData = findNodeData(endPos, true);

      // コンテナ（リストアイテム等）を跨いだ置換は、エディタの構造を破壊（アイテムの結合など）する恐れがあるため制限する
      if (
        startNodeData &&
        endNodeData &&
        startNodeData.container === endNodeData.container
      ) {
        try {
          range.setStart(startNodeData.node, startPos - startNodeData.start);
          range.setEnd(endNodeData.node, endPos - endNodeData.start);
          allReplacementRanges.push({
            range,
            target,
            origin,
            startAbs: startPos,
            endAbs: endPos,
          });
        } catch (e) {
          console.error("Replace-Solo: Failed to set range for", origin, e);
        }
      }
    }
  });

  // Rangeが重複しないようにフィルタリング
  allReplacementRanges.sort((a, b) => a.startAbs - b.startAbs);

  const finalRanges = [];
  let lastEnd = -1;
  allReplacementRanges.forEach((item) => {
    if (item.startAbs >= lastEnd) {
      finalRanges.push(item);
      lastEnd = item.endAbs;
    }
  });

  return finalRanges;
}

/**
 * 入力エミュレーションによる一括置換
 * 全テキストノードを1回走査し、すべての置換箇所の Range を収集してから一括実行する。
 */
function replaceByEmulationBatch(replacements) {
  // ページにフォーカスを当てる（execCommand の成功率を上げるため）
  window.focus();

  // 元の選択範囲を保存
  const originalSelection = window.getSelection();
  const originalRange =
    originalSelection.rangeCount > 0 ? originalSelection.getRangeAt(0) : null;

  const root = getTargetRoot();
  const validReplacements = Array.isArray(replacements)
    ? replacements.filter(
        (replacement) =>
          replacement !== null &&
          typeof replacement === "object" &&
          typeof replacement.target === "string",
      )
    : [];
  const allReplacementRanges = findRangesAcrossNodes(root, validReplacements);

  // 収集した Range を後ろから順に置換（ドキュメント構造の変化による影響を最小化）
  // 注意: 同一ノード内の複数置換も後ろから行えば位置ズレを防げる
  const affectedContainers = new Set();

  // execCommand を使用する場合、連続した置換において前の置換が後の Range に影響を与えないよう、
  // 原則として後ろから実行する。
  for (let i = allReplacementRanges.length - 1; i >= 0; i--) {
    const { range, target } = allReplacementRanges[i];

    if (typeof target !== "string") continue;

    // ノードがまだ接続されているか確認（途中の置換でDOMが壊れた場合への対策）
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
      continue;
    }

    const selection = window.getSelection();

    // 置換対象を含む contenteditable 要素を探してフォーカスを当てる
    const startNode =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentNode;

    if (!startNode) continue;
    const container = startNode.closest(
      '[contenteditable="true"], [role="textbox"]',
    );

    if (container) {
      // 明示的にコンテナにフォーカスを当て、かつブラウザウィンドウ自体にもフォーカスを要求する
      // UXを考慮し、不要なスクロールを防ぐため preventScroll: true を指定する
      container.focus({ preventScroll: true });
      affectedContainers.add(container);
    }

    try {
      selection.removeAllRanges();
      selection.addRange(range);

      // 選択が正しく行われたか確認するためのログ（デバッグ用）
      if (selection.rangeCount === 0) {
        console.warn(
          "Replace-Solo: Failed to add range to selection at index",
          i,
        );
      }

      // beforeinput イベントを発行 (Frameworkへの通知)
      // composed: true, isComposing: false を明示
      const beforeInputParams = {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: target,
        composed: true,
        isComposing: false,
      };
      const beforeInputEvent = new InputEvent("beforeinput", beforeInputParams);
      container?.dispatchEvent(beforeInputEvent);

      // リッチエディタのUndoスタックを維持するため execCommand を使用
      // 成功した場合はブラウザが自動的に input イベントを発行する場合があるが、
      // 明示的に発行することで確実に内部状態を更新させる。
      const success = document.execCommand("insertText", false, target);

      if (!success) {
        console.warn(
          "Replace-Solo: execCommand failed for range",
          i,
          ". Falling back to manual DOM update.",
        );
        // フォールバック: nodeValueを直接書き換え
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          const node = range.startContainer;
          const text = node.nodeValue;
          const start = range.startOffset;
          const end = range.endOffset;
          node.nodeValue =
            text.substring(0, start) + target + text.substring(end);
        }
      }

      // input イベントを即座に発行 (各置換ごとに行うことで確実性を高める)
      const inputParams = {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: target,
        composed: true,
        isComposing: false,
      };
      const inputEvent = new InputEvent("input", inputParams);
      container?.dispatchEvent(inputEvent);
    } catch (e) {
      console.warn(
        "Replace-Solo: Exception during replacement for range",
        i,
        e,
      );
    }
  }

  // 全体の変更完了を通知
  affectedContainers.forEach((container) => {
    container.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // 元の選択範囲を復元
  if (originalRange) {
    const finalSelection = window.getSelection();
    finalSelection.removeAllRanges();
    try {
      finalSelection.addRange(originalRange);
    } catch (e) {
      // DOM構造が大きく変わった場合は復元できない可能性がある
    }
  }

  console.debug(
    `Replace-Solo: Finished batch replacement of ${allReplacementRanges.length} occurrences.`,
  );
}
