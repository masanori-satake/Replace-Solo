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
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
  window.replaceSoloListenerRegistered = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ pong: true });
    return true;
  }

  if (request.action === 'EXTRACT_TEXT') {
    const root = getTargetRoot();
    const text = getEditableInnerText(root);
    sendResponse({ text: text });
    return true;
  }

  if (request.action === 'REPLACE_WORDS') {
    const { replacements } = request;
    // Microsoft Loopに特化し、入力エミュレーションのみをサポート
    replaceByEmulationBatch(replacements);
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
 * ノードが編集可能（ユーザーが入力を想定している箇所）かどうかを判定する
 */
function isNodeEditable(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element) return false;

  const tag = element.tagName.toUpperCase();
  if (tag === 'SCRIPT' || tag === 'STYLE') return false;

  // 特定の非表示・不要な要素（LoopのUIパーツなど）を除外
  if (isLoopUIElement(element)) return false;

  // contenteditable または role="textbox" を持っている要素内か判定
  return element.isContentEditable || !!element.closest('[role="textbox"]');
}

/**
 * 編集可能な要素からのみテキストを抽出する
 */
function getEditableInnerText(root) {
  // root自身が編集可能な場合
  const rootIsEditable = root.isContentEditable || (root.closest && root.closest('[role="textbox"]'));
  if (rootIsEditable) {
    if (!isLoopUIElement(root)) {
      return root.innerText;
    }
  }

  // 編集可能な属性を持つ要素を探す
  const editables = Array.from(root.querySelectorAll('[contenteditable], [role="textbox"]'));
  if (editables.length === 0) {
    // 編集可能なエリアが一つも見つからない場合は、指示に基づき制限をかけるため空を返す。
    return "";
  }

  const result = [];
  editables.forEach(el => {
    // 実際に編集可能かチェック（contenteditable="false"などを除外）
    const isActuallyEditable = el.isContentEditable || el.getAttribute('role') === 'textbox';
    if (!isActuallyEditable || isLoopUIElement(el)) return;

    // 入れ子になっている場合は、親だけを対象にする（innerTextに含まれるため）
    let isNested = false;
    let p = el.parentElement;
    while (p && p !== root) {
      if (p.isContentEditable || p.getAttribute('role') === 'textbox') {
        isNested = true;
        break;
      }
      p = p.parentElement;
    }

    if (!isNested) {
      result.push(el.innerText);
    }
  });

  return result.join('\n');
}

/**
 * LoopのUI要素かどうか判定する
 */
function isLoopUIElement(el) {
  if (!el || !el.closest) return false;
  return !!el.closest('.scriptor-blocks-commands-hover, .scriptor-blocks-commands-wrapper, .BlockUI, .ContentAddition');
}

/**
 * 複数のテキストノードに跨る可能性がある文字列を検索し、Rangeのリストを返す
 */
function findRangesAcrossNodes(root, replacements) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (isNodeEditable(node)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    }
  }, false);

  let combinedText = '';
  const nodeInfo = []; // { start: number, end: number, node: TextNode, container: Element }

  let node;
  let lastParent = null;
  let lastContainer = null;

  while (node = walker.nextNode()) {
    const text = node.nodeValue;
    if (text.length === 0) continue;

    // 編集可能なコンテナが変わった場合（例: 別のリストアイテムや段落に移動した場合）、
    // インデックスの整合性を保ち、意図しない跨ぎ一致を防ぐためにセパレータを入れる。
    // 親要素が変わったときだけ closest を呼び出すことで、ドキュメント走査時のパフォーマンスを改善する。
    const parent = node.parentElement;
    let currentContainer = lastContainer;
    if (parent !== lastParent) {
      currentContainer = parent?.closest('[contenteditable="true"], [role="textbox"]');
      if (lastContainer && currentContainer && currentContainer !== lastContainer) {
        combinedText += '\n';
      }
      lastParent = parent;
      lastContainer = currentContainer;
    }

    nodeInfo.push({
      start: combinedText.length,
      end: combinedText.length + text.length,
      node: node,
      container: currentContainer
    });
    combinedText += text;
  }


  const allReplacementRanges = [];

  replacements.forEach(({ origin, target }) => {
    if (!origin) return;

    // スペースや改行、タブなどの空白文字の連続を考慮した正規表現を作成
    // origin の構成文字を1文字ずつ分割し、その間に空白許容パターンを入れる。
    // origin が "手順１" の場合、"手\s*順\s*１" となる。
    // \s は [ \f\n\r\t\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff] を含むため、これを使用する。
    const chars = Array.from(origin);
    const regexSource = chars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\n\\r\\t]*');
    const regex = new RegExp(regexSource, 'g');

    let match;
    while ((match = regex.exec(combinedText)) !== null) {
      const range = document.createRange();
      const startPos = match.index;
      const endPos = match.index + match[0].length;

      // 開始位置と終了位置に対応するノードをバイナリサーチで特定
      const findNodeData = (pos, isEnd) => {
        let low = 0, high = nodeInfo.length - 1;
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
      if (startNodeData && endNodeData && startNodeData.container === endNodeData.container) {
        try {
          range.setStart(startNodeData.node, startPos - startNodeData.start);
          range.setEnd(endNodeData.node, endPos - endNodeData.start);
          allReplacementRanges.push({ range, target, origin, startAbs: startPos, endAbs: endPos });
        } catch (e) {
          console.error('Replace-Solo: Failed to set range for', origin, e);
        }
      }
    }
  });

  // Rangeが重複しないようにフィルタリング
  allReplacementRanges.sort((a, b) => a.startAbs - b.startAbs);

  const finalRanges = [];
  let lastEnd = -1;
  allReplacementRanges.forEach(item => {
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
  const originalRange = originalSelection.rangeCount > 0 ? originalSelection.getRangeAt(0) : null;

  const root = getTargetRoot();
  const allReplacementRanges = findRangesAcrossNodes(root, replacements);

  // 収集した Range を後ろから順に置換（ドキュメント構造の変化による影響を最小化）
  // 注意: 同一ノード内の複数置換も後ろから行えば位置ズレを防げる
  const affectedContainers = new Set();

  // execCommand を使用する場合、連続した置換において前の置換が後の Range に影響を与えないよう、
  // 原則として後ろから実行する。
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
      // UXを考慮し、不要なスクロールを防ぐため preventScroll: true を指定する
      container.focus({ preventScroll: true });
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
