/**
 * Replace-Solo Content Script
 * Responsible for text extraction and replacement in the active tab.
 */

console.log('Replace-Solo: Content script injected');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_TEXT') {
    const text = document.body.innerText;
    sendResponse({ text: text });
    return true;
  }

  if (request.action === 'REPLACE_WORD') {
    const { origin, target, mode } = request;
    if (mode === 'emulation') {
      replaceByEmulation(origin, target);
    } else {
      replaceByDom(origin, target);
    }
    sendResponse({ success: true });
    return true;
  }
});

/**
 * DOM 直接書き換えによる置換 (標準的な TreeWalker と Node の操作を使用)
 */
function replaceByDom(origin, target) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const nodesToProcess = [];

  while (node = walker.nextNode()) {
    if (node.nodeValue.includes(origin)) {
      nodesToProcess.push(node);
    }
  }

  nodesToProcess.forEach(node => {
    // 既存ノードを直接書き換え。単純な文字列置換のため構造を壊さない。
    node.nodeValue = node.nodeValue.split(origin).join(target);
  });
}

/**
 * 入力エミュレーションによる置換 (Microsoft Loop, Google Docs 等に対応)
 * 標準的な Range / Selection API と insertText を使用。
 */
function replaceByEmulation(origin, target) {
  // 元の選択範囲を保存
  const originalSelection = window.getSelection();
  const originalRange = originalSelection.rangeCount > 0 ? originalSelection.getRangeAt(0) : null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const ranges = [];

  // 全てのテキストノードを走査し、一致箇所の Range を取得
  while (node = walker.nextNode()) {
    let index = 0;
    while ((index = node.nodeValue.indexOf(origin, index)) !== -1) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + origin.length);
      ranges.push(range);
      index += origin.length;
    }
  }

  // 見つかった箇所を逆順に置換（前方から置換するとノードの位置がズレる可能性があるため）
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // document.execCommand('insertText') は非推奨だが、リッチエディタのUndo履歴を
    // 維持するためのデファクトスタンダードな手段。
    // 代替案としての InputEvent は完全にエミュレートできない場合が多いため継続採用。
    document.execCommand('insertText', false, target);
  }

  // 元の選択範囲を復元
  if (originalRange) {
    const finalSelection = window.getSelection();
    finalSelection.removeAllRanges();
    finalSelection.addRange(originalRange);
  }

  console.log(`Replace-Solo: Replaced ${origin} -> ${target} (${ranges.length} occurrences) using standard API search.`);
}
