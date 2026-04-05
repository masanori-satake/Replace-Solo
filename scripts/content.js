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
 * DOM 直接書き換えによる置換
 */
function replaceByDom(origin, target) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const nodesToReplace = [];

  while (node = walker.nextNode()) {
    if (node.nodeValue.includes(origin)) {
      nodesToReplace.push(node);
    }
  }

  nodesToReplace.forEach(node => {
    node.nodeValue = node.nodeValue.split(origin).join(target);
  });
}

/**
 * 入力エミュレーションによる置換 (Microsoft Loop, Google Docs 等に対応)
 */
function replaceByEmulation(origin, target) {
  // window.find() を使用してテキストを選択し、execCommand で置換する
  // ページ内をループして全ての出現箇所を置換
  const originalSelection = window.getSelection();
  const originalRange = originalSelection.rangeCount > 0 ? originalSelection.getRangeAt(0) : null;

  // カーソルを先頭に
  window.getSelection().removeAllRanges();

  let count = 0;
  // window.find(aString, aCaseSensitive, aBackwards, aWrapAround, aWholeWord, aSearchInFrames, aShowDialog)
  // 無限ループ防止のため aWrapAround は false に設定
  while (window.find(origin, false, false, false, false, false, false)) {
    document.execCommand('insertText', false, target);
    count++;
    // 無限ループ防止 (同じ箇所を何度も見つけてしまう場合がある)
    if (count > 1000) break;
  }

  // 元の選択範囲を復元 (もし可能なら)
  if (originalRange) {
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(originalRange);
  }

  console.log(`Replace-Solo: Emulated input ${origin} -> ${target} (${count} occurrences)`);
}
