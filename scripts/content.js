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

/**
 * DOM 直接書き換えによる一括置換
 */
function replaceByDomBatch(replacements) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const nodesToProcess = [];

  while (node = walker.nextNode()) {
    nodesToProcess.push(node);
  }

  nodesToProcess.forEach(node => {
    let text = node.nodeValue;
    let changed = false;
    replacements.forEach(({ origin, target }) => {
      if (text.includes(origin)) {
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
 */
function replaceByEmulationBatch(replacements) {
  // 元の選択範囲を保存
  const originalSelection = window.getSelection();
  const originalRange = originalSelection.rangeCount > 0 ? originalSelection.getRangeAt(0) : null;

  replacements.forEach(({ origin, target }) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const ranges = [];

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

    // 逆順に置換
    for (let i = ranges.length - 1; i >= 0; i--) {
      const range = ranges[i];
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, target);
    }
  });

  // 元の選択範囲を復元
  if (originalRange) {
    const finalSelection = window.getSelection();
    finalSelection.removeAllRanges();
    finalSelection.addRange(originalRange);
  }

  console.log(`Replace-Solo: Replaced ${replacements.length} types of words.`);
}
