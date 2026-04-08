/**
 * Replace-Solo Content Script
 * Responsible for text extraction and replacement in the active tab.
 */

console.log('Replace-Solo: Content script injected');

if (typeof window.replaceSoloLoaded === 'undefined') {
  window.replaceSoloLoaded = true;
  setupMessageListener();
}

/**
 * Register the message listener once.
 */
function setupMessageListener() {
  if (window.replaceSoloListenerRegistered) return;
  window.replaceSoloListenerRegistered = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ pong: true });
    return true;
  }

  if (request.action === 'EXTRACT_TEXT') {
    const root = getTargetRoot();
    const text = root.innerText;
    sendResponse({ text: text });
    return true;
  }

  if (request.action === 'REPLACE_WORDS') {
    const { replacements, mode } = request;
    if (mode === 'emulation') {
      replaceByEmulationBatch(replacements);
    } else {
      replaceByDomBatch(replacements);
    }
    sendResponse({ success: true });
    return true;
  }
});
}

/**
 * 置換・抽出対象のルート要素を取得する
 */
function getTargetRoot() {
  const hostname = window.location.hostname;
  if (hostname === 'loop.microsoft.com' || hostname === 'loop.cloud.microsoft') {
    // Loopのメインコンテンツ（タイトルと本文）を包む要素を優先的に探す
    // .scriptor-canvas-grid-layout は通常、タイトルエリアと本文エリアの両方を包含する
    const mainCanvas = document.querySelector('.scriptor-canvas.scriptor-canvas-grid-layout');
    if (mainCanvas) return mainCanvas;

    // 個別の .scriptor-canvas がある場合（古い構成や特殊なページなど）
    // 最初の canvas がメインエリアである可能性が高い
    const firstCanvas = document.querySelector('.scriptor-canvas');
    if (firstCanvas) return firstCanvas;

    // 従来のセレクタ（ライブピルポータルアンカーの次）
    const anchor = document.getElementById('livepill-portal-anchor');
    if (anchor && anchor.nextElementSibling) {
      return anchor.nextElementSibling;
    }
  }
  return document.body;
}

/**
 * DOM 直接書き換えによる一括置換
 */
function replaceByDomBatch(replacements) {
  const root = getTargetRoot();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const nodesToProcess = [];

  while (node = walker.nextNode()) {
    nodesToProcess.push(node);
  }

  nodesToProcess.forEach(node => {
    let text = node.nodeValue;
    let changed = false;

    // 単一のテキストノードに対して全置換ルールを順次適用
    replacements.forEach(({ origin, target }) => {
      if (origin && text.includes(origin)) {
        text = text.split(origin).join(target);
        changed = true;
      }
    });

    if (changed) {
      node.nodeValue = text;
    }
  });
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
  const originalRange = originalSelection.rangeCount > 0 ? originalSelection.getRangeAt(0) : null;

  const root = getTargetRoot();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const allReplacementRanges = []; // { range: Range, target: string }

  // 全テキストノードを1回だけ走査
  while (node = walker.nextNode()) {
    const text = node.nodeValue;

    // 各ノードについて、すべての置換ルールの一致箇所を特定
    const matchesInNode = [];
    replacements.forEach(({ origin, target }) => {
      if (!origin) return;
      let index = 0;
      while ((index = text.indexOf(origin, index)) !== -1) {
        matchesInNode.push({ index, length: origin.length, target });
        index += origin.length;
      }
    });

    // 同じノード内で位置が重ならないようにソート
    // (簡易化のため、重なりは考慮せず出現順に Range を作成)
    matchesInNode.sort((a, b) => a.index - b.index);

    matchesInNode.forEach(match => {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match.length);
      allReplacementRanges.push({ range, target: match.target });
    });
  }

  // 収集した Range を後ろから順に置換（ドキュメント構造の変化による影響を最小化）
  // 注意: 同一ノード内の複数置換も後ろから行えば位置ズレを防げる
  for (let i = allReplacementRanges.length - 1; i >= 0; i--) {
    const { range, target } = allReplacementRanges[i];
    const selection = window.getSelection();

    try {
      selection.removeAllRanges();
      selection.addRange(range);
      // リッチエディタのUndoスタックを維持するため execCommand を使用
      document.execCommand('insertText', false, target);
    } catch (e) {
      console.warn('Replace-Solo: Failed to replace a range', e);
    }
  }

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

  console.log(`Replace-Solo: Finished batch replacement of ${allReplacementRanges.length} occurrences.`);
}
