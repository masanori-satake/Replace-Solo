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
  });
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
    ::highlight(replace-solo-find) {
      background-color: #fff176;
      color: #000000;
    }
    ::highlight(replace-solo-find-current) {
      background-color: #ff9100;
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
/**
 * テキストノードが画面に表示されるものかどうかを判定する。
 * - visibility は最も内側の要素の計算値がそのまま実効値になる
 *   （配下の要素が visible を指定すれば再表示されるため、祖先の値は見ない）
 * - display:none と content-visibility:hidden は配下全体を不可視にするため、
 *   祖先をたどって確認する
 */
function isTextNodeVisible(node, editorRoot) {
  const parent = node.parentElement;
  if (!parent) return false;

  const parentStyle = window.getComputedStyle(parent);
  if (
    parentStyle.visibility === "hidden" ||
    parentStyle.visibility === "collapse"
  ) {
    return false;
  }

  // 検索ルートの外側（body / documentElement まで含む）も確認する。
  // ルート自体が display:none のラッパーの中にある場合を取りこぼさないため。
  let current = parent;
  while (current) {
    const style =
      current === parent ? parentStyle : window.getComputedStyle(current);
    if (style.display === "none" || style.contentVisibility === "hidden") {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function isSafeTextNode(node, editorRoot) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  if (!node.nodeValue) return false;

  // 条件0: 不可視の要素配下の文字列は、検索・抽出・置換の対象にしない
  if (!isTextNodeVisible(node, editorRoot)) return false;

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
 * 対象ルート内の安全なテキストノードを走査し、
 * 結合テキストとノード位置の索引（nodeInfo）を構築する。
 * コンテナ（段落・リストアイテム等）が変わる境界にはセパレータ "\n" を入れる。
 */
function buildTextIndex(root) {
  // 除外されるテキストノードも走査対象に含める（採用判定はループ内で行う）。
  // 除外された文字列が間にあることを検出し、検索時のセグメント分割に使うため。
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  let combinedText = "";
  const nodeInfo = []; // { start: number, end: number, node: TextNode, container: Element, segment: number }

  let node;
  let lastParent = null;
  let lastContainer = null;
  let segmentId = 0;
  // 除外された文字列が最後の採用ノードとの間にあったかどうか
  let gapPending = false;

  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    if (text.length === 0) continue;

    if (!(isNodeEditable(node) && isSafeTextNode(node, root))) {
      gapPending = true;
      continue;
    }

    // 編集可能なコンテナが変わった場合（例: 別のリストアイテムや段落に移動した場合）、
    // インデックスの整合性を保ち、意図しない跨ぎ一致を防ぐためにセパレータを入れる。
    // 親要素が変わったときだけ closest を呼び出すことで、ドキュメント走査時のパフォーマンスを改善する。
    const parent = node.parentElement;
    let currentContainer = lastContainer;
    let containerChanged = false;
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
        containerChanged = true;
      }
      lastParent = parent;
      lastContainer = currentContainer;
    }

    // コンテナが変わった箇所と、除外された文字列を挟んだ箇所では、
    // 検索のセグメントを分ける（一致がそこを跨がないようにする）。
    if (nodeInfo.length > 0 && (containerChanged || gapPending)) {
      segmentId += 1;
    }
    gapPending = false;

    nodeInfo.push({
      start: combinedText.length,
      end: combinedText.length + text.length,
      node: node,
      container: currentContainer,
      segment: segmentId,
    });
    combinedText += text;
  }

  return { combinedText, nodeInfo };
}

/**
 * 結合テキスト上の位置 pos に対応するノード情報をバイナリサーチで特定する。
 * 開始位置(isEnd=false)の場合、そのノードの範囲内に pos が含まれる必要がある [start, end)
 * 終了位置(isEnd=true)の場合、そのノードの範囲内に pos が含まれる必要がある (start, end]
 * これにより、ノード境界（あるノードの末尾かつ次のノードの先頭）で正しいノードが選択される。
 */
function findNodeDataForPosition(nodeInfo, pos, isEnd) {
  let low = 0,
    high = nodeInfo.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const info = nodeInfo[mid];
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
}

/**
 * 複数のテキストノードに跨る可能性がある文字列を検索し、Rangeのリストを返す
 */
function findRangesAcrossNodes(root, replacements) {
  const { combinedText, nodeInfo } = buildTextIndex(root);

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
      const startNodeData = findNodeDataForPosition(nodeInfo, startPos, false);
      const endNodeData = findNodeDataForPosition(nodeInfo, endPos, true);

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
 * 1件の Range を入力エミュレーションで置換する。
 * 置換したコンテナは affectedContainers に集められ、呼び出し側が
 * まとめて change イベントを発行する。
 */
/**
 * 1件の Range を入力エミュレーションで置換する。
 * 実際に置換できた場合のみ true を返す（件数表示を実態に合わせるため）。
 */
function replaceRangeByEmulation(range, target, affectedContainers) {
  if (typeof target !== "string") return false;

  // ノードがまだ接続されているか確認（途中の置換でDOMが壊れた場合への対策）
  if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
    return false;
  }

  const selection = window.getSelection();

  // 置換対象を含む contenteditable 要素を探してフォーカスを当てる
  const startNode =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentNode;

  if (!startNode) return false;
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
      console.warn("Replace-Solo: Failed to add range to selection");
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
    let replaced = success;

    if (!success) {
      console.warn(
        "Replace-Solo: execCommand failed for range. Falling back to manual DOM update.",
      );
      // フォールバック: 同一 Text ノード内に収まる範囲だけを対象にする。
      // replaceData で対象区間だけを更新し、同じノード内の他のライブ Range を
      // 壊さない。別ノードに跨る範囲は、オフセットの意味がノードごとに異なる
      // ため書き換えず、失敗として返す（誤った文字列を作らない）。
      if (
        range.startContainer === range.endContainer &&
        range.startContainer.nodeType === Node.TEXT_NODE
      ) {
        const node = range.startContainer;
        node.replaceData(
          range.startOffset,
          range.endOffset - range.startOffset,
          target,
        );
        replaced = true;
      }
    }

    if (replaced) {
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
    }
    return replaced;
  } catch (e) {
    console.warn("Replace-Solo: Exception during replacement for range", e);
    return false;
  }
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
    replaceRangeByEmulation(range, target, affectedContainers);
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

// ===== 検索モード（ページ内パネルの「検索と置換」用） =====
//
// VS Code の検索ウィジェットに相当する機能をページ側で提供する。
// 一致の収集・ハイライト・現在位置の管理はここで行い、
// パネル（inpage.js）は状態を受け取って表示するだけにする。
// 置換は辞書置換と同じ入力エミュレーション（replaceRangeByEmulation）を使うため、
// エディタの Undo スタックが維持される。
// 置換可能な一致は、辞書置換と同じく「同一コンテナ内に収まる一致」に限る。

let findMatches = []; // { range, startAbs, endAbs }
let findCurrentIndex = -1;
let findQuery = "";
let findOptions = { caseSensitive: false, useRegex: false };
let findTruncated = false; // 上限で打ち切ったかどうか

// 一致数の上限。ありふれた語で巨大なページを検索したときに、
// Range とハイライトが際限なく増えてタブを固めるのを防ぐ。
// ドキュメント変更のたびに再検索する追従処理の負荷も、この上限で抑える。
const FIND_MAX_MATCHES = 1000;

function getFindState(error = null) {
  return {
    count: findMatches.length,
    currentIndex: findCurrentIndex,
    error,
    truncated: findTruncated,
  };
}

// ===== ドキュメント変更への追従 =====
//
// 置換後にユーザーが Undo したり本文を手で編集したりすると、
// 検索の一致はページ側の都合で変わる。検索語がある間は対象ルートを
// MutationObserver で監視し、変更が落ち着いたら再検索して
// 件数とハイライトを実態に合わせる。再検索の結果は CustomEvent で
// パネル（inpage.js）へ通知する。
let findObserver = null;
let findRefreshTimer = null;

function armFindObserver() {
  disarmFindObserver();
  if (typeof MutationObserver === "undefined") return;
  const root = getTargetRoot();
  if (!root) return;
  findObserver = new MutationObserver(() => {
    if (!findQuery) return;
    if (findRefreshTimer) clearTimeout(findRefreshTimer);
    findRefreshTimer = setTimeout(() => {
      findRefreshTimer = null;
      if (!findQuery) return;
      const state = refreshFindMatches(findCurrentIndex);
      window.dispatchEvent(
        new CustomEvent("replace-solo:find-state", { detail: state }),
      );
    }, 300);
  });
  findObserver.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    // 表示・非表示を切り替える属性の変更でも再検索する
    attributes: true,
    attributeFilter: ["style", "class", "hidden"],
  });
  // 可視判定はルートの外側の祖先まで見るため、その属性変更も監視する
  // （解除は disarmFindObserver の disconnect でまとめて行われる）
  let ancestor = root.parentElement;
  while (ancestor) {
    findObserver.observe(ancestor, {
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });
    ancestor = ancestor.parentElement;
  }
}

function disarmFindObserver() {
  if (findObserver) {
    findObserver.disconnect();
    findObserver = null;
  }
  if (findRefreshTimer) {
    clearTimeout(findRefreshTimer);
    findRefreshTimer = null;
  }
}

/**
 * 検索条件から RegExp を作る。通常検索では正規表現メタ文字をエスケープする。
 * 正規表現が不正な場合は例外を投げる（呼び出し側でエラー表示に変える）。
 */
function buildFindRegex(query, options) {
  const source = options.useRegex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(source, options.caseSensitive ? "g" : "gi");
}

/**
 * セグメント（コンテナの切れ目と、除外された文字列の前後で分割した連続区間）
 * ごとに検索し、同一コンテナ内に収まる一致の Range を集める。
 * セグメントを跨ぐ一致は作らないため、跨ぎ一致に隠れて有効な一致が
 * 取りこぼされることも、編集不可の要素を含む一致が生まれることもない。
 */
function collectFindMatches(root, regex) {
  const { combinedText, nodeInfo } = buildTextIndex(root);
  const matches = [];
  let truncated = false;

  // nodeInfo をセグメントごとに分ける
  const segments = [];
  for (const info of nodeInfo) {
    const last = segments[segments.length - 1];
    if (last && last.segment === info.segment) {
      last.entries.push(info);
    } else {
      segments.push({ segment: info.segment, entries: [info] });
    }
  }

  for (const seg of segments) {
    if (truncated) break;
    const segStart = seg.entries[0].start;
    const segEnd = seg.entries[seg.entries.length - 1].end;
    const segText = combinedText.slice(segStart, segEnd);
    // セグメントごとに新しい RegExp で照合する（lastIndex を共有しない）
    const segRegex = new RegExp(regex.source, regex.flags);

    let match;
    while ((match = segRegex.exec(segText)) !== null) {
      // 空一致（例: "a*" の空ヒット）は対象にせず、無限ループを避けて1文字進める
      if (match[0].length === 0) {
        segRegex.lastIndex += 1;
        continue;
      }
      // 上限に達したら Range は作らず、打ち切りの有無だけを確認して終える
      if (matches.length >= FIND_MAX_MATCHES) {
        truncated = true;
        break;
      }
      const startPos = segStart + match.index;
      const endPos = startPos + match[0].length;
      const startNodeData = findNodeDataForPosition(
        seg.entries,
        startPos,
        false,
      );
      const endNodeData = findNodeDataForPosition(seg.entries, endPos, true);

      // コンテナを跨ぐ一致は構造を壊す恐れがあるため、辞書置換と同じく対象外
      if (
        startNodeData &&
        endNodeData &&
        startNodeData.container === endNodeData.container
      ) {
        try {
          const range = document.createRange();
          range.setStart(startNodeData.node, startPos - startNodeData.start);
          range.setEnd(endNodeData.node, endPos - endNodeData.start);
          matches.push({
            range,
            startAbs: startPos,
            endAbs: endPos,
            text: match[0],
          });
        } catch (e) {
          console.error("Replace-Solo: Failed to set find range", e);
        }
      }
    }
  }
  return { matches, truncated };
}

/**
 * 検索のハイライト（全一致＋現在位置）を CSS Custom Highlight API で描く。
 */
function applyFindHighlights() {
  if (typeof CSS === "undefined" || !CSS.highlights) return;
  if (findMatches.length === 0) {
    CSS.highlights.delete("replace-solo-find");
    CSS.highlights.delete("replace-solo-find-current");
    return;
  }
  ensureHighlightStyle();
  const validRanges = findMatches
    .map((m) => m.range)
    .filter((r) => r.startContainer.isConnected && r.endContainer.isConnected);
  if (validRanges.length > 0) {
    CSS.highlights.set("replace-solo-find", new Highlight(...validRanges));
  } else {
    CSS.highlights.delete("replace-solo-find");
  }
  const current = findMatches[findCurrentIndex];
  if (current && current.range.startContainer.isConnected) {
    CSS.highlights.set(
      "replace-solo-find-current",
      new Highlight(current.range),
    );
  } else {
    CSS.highlights.delete("replace-solo-find-current");
  }
}

/**
 * 要素を内包する、実際にスクロール可能な最も近い祖先を探す。
 * 見つからなければドキュメントのスクローラを返す。
 */
function findScrollableAncestor(el) {
  // 要素自身がスクローラである場合も対象にする（直接テキストを持つ編集要素など）
  let current = el || null;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (
      (style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

/**
 * 現在の一致が見える位置までスクロールする。
 *
 * 段落要素を対象に scrollIntoView すると、段落が長い場合に一致箇所と
 * ずれたり、エディタ側のスクロール管理と競合して途中で止まったりする。
 * そのため、一致箇所（Range）自体の矩形を基準にスクロール量を決め、
 * スクロール後に可視領域へ入ったかを確認して、外れていれば補正する。
 */
function scrollFindCurrentIntoView() {
  const current = findMatches[findCurrentIndex];
  if (!current) return;
  const range = current.range;
  if (!range.startContainer.isConnected) return;

  const startNode = range.startContainer;
  const el =
    startNode.nodeType === Node.ELEMENT_NODE
      ? startNode
      : startNode.parentElement;

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    // 矩形が取れない場合は要素単位のスクロールにフォールバック
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center" });
    }
    return;
  }

  const scroller = findScrollableAncestor(el);
  const isDocumentScroller =
    !scroller ||
    scroller === document.scrollingElement ||
    scroller === document.documentElement;

  // 一致箇所の中心がスクロール領域の中心に来るよう、スクロール位置を動かす
  const centerMatch = () => {
    const r = range.getBoundingClientRect();
    if (isDocumentScroller) {
      window.scrollBy(0, r.top + r.height / 2 - window.innerHeight / 2);
    } else {
      const sRect = scroller.getBoundingClientRect();
      scroller.scrollTop +=
        r.top + r.height / 2 - (sRect.top + scroller.clientHeight / 2);
    }
  };

  centerMatch();

  // エディタ側の再描画などで位置がずれ、可視領域の外に出る場合があるため、
  // 次の描画フレームで確認し、外れていれば一度だけ補正する
  requestAnimationFrame(() => {
    if (!range.startContainer.isConnected) return;
    const r = range.getBoundingClientRect();
    let visibleTop = 0;
    let visibleBottom = window.innerHeight;
    if (!isDocumentScroller) {
      const sRect = scroller.getBoundingClientRect();
      visibleTop = Math.max(0, sRect.top);
      visibleBottom = Math.min(window.innerHeight, sRect.bottom);
    }
    const margin = 48;
    if (r.bottom < visibleTop + margin || r.top > visibleBottom - margin) {
      centerMatch();
    }
  });
}

/**
 * 検索を実行し、一致と現在位置（先頭）を更新する。
 * 入力中の検索を想定し、スクロールはしない。
 * @returns {{count: number, currentIndex: number, error: string|null}}
 */
function findInPage(query, options) {
  findQuery = typeof query === "string" ? query : "";
  findOptions = {
    caseSensitive: !!(options && options.caseSensitive),
    useRegex: !!(options && options.useRegex),
  };

  if (!findQuery) {
    findMatches = [];
    findCurrentIndex = -1;
    findTruncated = false;
    applyFindHighlights();
    disarmFindObserver();
    return getFindState();
  }

  let regex;
  try {
    regex = buildFindRegex(findQuery, findOptions);
  } catch (e) {
    findMatches = [];
    findCurrentIndex = -1;
    findTruncated = false;
    applyFindHighlights();
    return getFindState("正規表現が正しくありません。");
  }

  const root = getTargetRoot();
  const collected = collectFindMatches(root, regex);
  findMatches = collected.matches;
  findTruncated = collected.truncated;
  findCurrentIndex = findMatches.length > 0 ? 0 : -1;
  applyFindHighlights();
  // Undo や手動編集で一致が変わっても追従できるよう、監視を開始する
  armFindObserver();
  return getFindState();
}

/**
 * 現在位置を前後に移動する（末尾と先頭で循環）。移動先へスクロールする。
 */
function navigateFindMatches(delta) {
  if (findMatches.length === 0) return getFindState();
  const count = findMatches.length;
  findCurrentIndex = (((findCurrentIndex + delta) % count) + count) % count;
  applyFindHighlights();
  scrollFindCurrentIntoView();
  return getFindState();
}

/**
 * 置換後に同じ条件で再検索し、現在位置をできるだけ保つ。
 */
function refreshFindMatches(preferredIndex) {
  if (!findQuery) return getFindState();
  let regex;
  try {
    regex = buildFindRegex(findQuery, findOptions);
  } catch (e) {
    return getFindState("正規表現が正しくありません。");
  }
  const root = getTargetRoot();
  const collected = collectFindMatches(root, regex);
  findMatches = collected.matches;
  findTruncated = collected.truncated;
  if (findMatches.length === 0) {
    findCurrentIndex = -1;
  } else if (preferredIndex >= 0 && preferredIndex < findMatches.length) {
    findCurrentIndex = preferredIndex;
  } else {
    findCurrentIndex = findMatches.length - 1;
  }
  applyFindHighlights();
  return getFindState();
}

/**
 * 置換直前の再検証。収集時と同じ文字列を指していることと、
 * 両端のテキストノードが今も編集可能な検索対象であることを確認する。
 * （検索後に編集不可へ変わった箇所を、フォールバックで書き換えてしまわないため）
 */
function isFindMatchStillValid(item) {
  if (item.range.toString() !== item.text) return false;
  const root = getTargetRoot();
  const startNode = item.range.startContainer;
  const endNode = item.range.endContainer;
  if (startNode.nodeType !== Node.TEXT_NODE) return false;
  if (endNode.nodeType !== Node.TEXT_NODE) return false;
  return (
    isNodeEditable(startNode) &&
    isSafeTextNode(startNode, root) &&
    isNodeEditable(endNode) &&
    isSafeTextNode(endNode, root)
  );
}

/**
 * 現在の一致を1件だけ置換する。置換後は次の一致が同じ位置に繰り上がる。
 */
function replaceCurrentFindMatch(replacement) {
  const current = findMatches[findCurrentIndex];
  if (!current) return { replaced: false, ...getFindState() };

  // ページ側の変更でライブ Range が別の文字列を指すようになっていたり、
  // 編集可能な対象から外れていたら、置換せずに再検索して返す。
  if (!isFindMatchStillValid(current)) {
    const state = refreshFindMatches(findCurrentIndex);
    return { replaced: false, ...state };
  }

  window.focus();
  const affectedContainers = new Set();
  const replaced = replaceRangeByEmulation(
    current.range,
    replacement,
    affectedContainers,
  );
  affectedContainers.forEach((container) => {
    container.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const state = refreshFindMatches(findCurrentIndex);
  return { replaced, ...state };
}

/**
 * 表示中の全一致を置換する（後ろから実行し、位置ズレを防ぐ）。
 */
function replaceAllFindMatches(replacement) {
  if (findMatches.length === 0) return { replacedCount: 0, ...getFindState() };

  window.focus();
  const affectedContainers = new Set();
  const targets = [...findMatches].reverse();
  let replacedCount = 0;
  targets.forEach((item) => {
    // 収集時と違う文字列を指すようになった Range や、
    // 編集可能な対象から外れた Range は置換しない
    if (!isFindMatchStillValid(item)) return;
    if (replaceRangeByEmulation(item.range, replacement, affectedContainers)) {
      replacedCount += 1;
    }
  });
  affectedContainers.forEach((container) => {
    container.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const state = refreshFindMatches(0);
  return { replacedCount, ...state };
}

/**
 * 検索状態とハイライトを消去する。
 */
function clearFindMatches() {
  findMatches = [];
  findCurrentIndex = -1;
  findQuery = "";
  findTruncated = false;
  disarmFindObserver();
  applyFindHighlights();
}
