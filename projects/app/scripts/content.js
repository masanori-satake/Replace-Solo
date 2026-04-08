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
  // サブドメインの変動に備え endsWith で判定
  const isLoop = hostname.endsWith('loop.microsoft.com') || hostname.endsWith('loop.cloud.microsoft');

  if (isLoop) {
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
  const affectedContainers = new Set();
  for (let i = allReplacementRanges.length - 1; i >= 0; i--) {
    const { range, target } = allReplacementRanges[i];

    // ノードがまだ接続されているか確認（途中の置換でDOMが壊れた場合への対策）
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
      continue;
    }

    const selection = window.getSelection();

    // 置換対象を含む contenteditable 要素を探してフォーカスを当てる
    const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentNode;

    if (!startNode) continue;
    const container = startNode.closest('[contenteditable="true"], [role="textbox"]');

    if (container) {
      // 明示的にコンテナにフォーカスを当て、かつブラウザウィンドウ自体にもフォーカスを要求する
      container.focus();
      affectedContainers.add(container);
    }

    try {
      selection.removeAllRanges();
      selection.addRange(range);

      // 選択が正しく行われたか確認するためのログ（デバッグ用）
      if (selection.rangeCount === 0) {
        console.warn('Replace-Solo: Failed to add range to selection at index', i);
      }

      // beforeinput イベントを発行 (Frameworkへの通知)
      // composed: true, isComposing: false を明示
      const beforeInputParams = {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: target,
        composed: true,
        isComposing: false
      };
      const beforeInputEvent = new InputEvent('beforeinput', beforeInputParams);
      container?.dispatchEvent(beforeInputEvent);

      // リッチエディタのUndoスタックを維持するため execCommand を使用
      // 成功した場合はブラウザが自動的に input イベントを発行する場合があるが、
      // 明示的に発行することで確実に内部状態を更新させる。
      const success = document.execCommand('insertText', false, target);

      if (!success) {
        console.warn('Replace-Solo: execCommand failed for range', i, '. Falling back to manual DOM update.');
        // フォールバック: nodeValueを直接書き換え
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          const node = range.startContainer;
          const text = node.nodeValue;
          const start = range.startOffset;
          const end = range.endOffset;
          node.nodeValue = text.substring(0, start) + target + text.substring(end);
        }
      }

      // input イベントを即座に発行 (各置換ごとに行うことで確実性を高める)
      const inputParams = {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: target,
        composed: true,
        isComposing: false
      };
      const inputEvent = new InputEvent('input', inputParams);
      container?.dispatchEvent(inputEvent);

    } catch (e) {
      console.warn('Replace-Solo: Exception during replacement for range', i, e);
    }
  }

  // 全体の変更完了を通知
  affectedContainers.forEach(container => {
    container.dispatchEvent(new Event('change', { bubbles: true }));
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

  console.log(`Replace-Solo: Finished batch replacement of ${allReplacementRanges.length} occurrences.`);
}
