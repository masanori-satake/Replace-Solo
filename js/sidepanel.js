/**
 * Replace-Solo Side Panel
 * Handling UI interactions and kuromoji.js integration.
 */

console.log('Replace-Solo: Side Panel Loaded');

let tokenizer = null;
let currentWords = []; // 現在リストされている単語
let localDictionary = {}; // {"target": ["origin1", "origin2", ...]}

// kuromoji.js の初期化
kuromoji.builder({ dicPath: 'lib/kuromoji/dict/' }).build((err, _tokenizer) => {
  if (err) {
    console.error('kuromoji initialization error:', err);
    return;
  }
  tokenizer = _tokenizer;
  console.log('kuromoji.js initialized');
});

// 初期データの読み込み
chrome.storage.local.get(['dictionary'], (result) => {
  if (result.dictionary) {
    localDictionary = result.dictionary;
    console.log('Replace-Solo: Local dictionary loaded');
  } else {
    // デフォルトの初期データ (口癖など)
    localDictionary = {
      "": ["えー", "えーっと", "あのー", "そのー"]
    };
    chrome.storage.local.set({ dictionary: localDictionary });
  }
});

// UI Event Listeners
document.getElementById('analyze-btn').addEventListener('click', () => {
  if (!tokenizer) {
    alert('形態素解析エンジンの準備中です。少々お待ちください。');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab) {
      autoSetMode(activeTab.url || "");
      chrome.tabs.sendMessage(activeTab.id, { action: 'EXTRACT_TEXT' }, (response) => {
        if (response && response.text) {
          analyzeAndDisplay(response.text);
        }
      });
    }
  });
});

function autoSetMode(url) {
  const emulationDomains = [
    'loop.microsoft.com',
    'docs.google.com',
    'sheets.google.com'
  ];
  const isEmulation = emulationDomains.some(domain => url.includes(domain));
  document.getElementById('mode-toggle').checked = isEmulation;
}

document.getElementById('add-word-btn').addEventListener('click', () => {
  const manualWord = document.getElementById('manual-word').value.trim();
  if (manualWord) {
    addWordToList(manualWord, true);
    document.getElementById('manual-word').value = '';
  }
});

document.getElementById('replace-all-btn').addEventListener('click', () => {
  const rows = document.querySelectorAll('.word-row');
  rows.forEach(row => {
    const applyCheck = row.querySelector('.apply-check');
    if (applyCheck.checked) {
      const origin = row.querySelector('.word-origin').innerText;
      const target = row.querySelector('.replace-input').value;
      const dictCheck = row.querySelector('.dict-check');

      executeReplacement(origin, target);

      if (dictCheck.checked && !dictCheck.disabled) {
        saveToDictionary(origin, target);
      }
    }
  });
});

document.getElementById('reset-btn').addEventListener('click', () => {
  // 再解析を実行してリセット
  document.getElementById('analyze-btn').click();
});

document.getElementById('export-json').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(localDictionary, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'replace-solo-dictionary.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-json').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (re) => {
      try {
        const imported = JSON.parse(re.target.result);
        // 簡易バリデーション
        if (typeof imported === 'object' && !Array.isArray(imported)) {
          if (confirm('辞書を上書きしますか？（キャンセルで追加）')) {
            localDictionary = imported;
          } else {
            // マージ処理
            for (const [target, origins] of Object.entries(imported)) {
              if (localDictionary[target]) {
                localDictionary[target] = [...new Set([...localDictionary[target], ...origins])];
              } else {
                localDictionary[target] = origins;
              }
            }
          }
          chrome.storage.local.set({ dictionary: localDictionary });
          alert('インポート完了');
        }
      } catch (err) {
        alert('無効なJSONファイルです。');
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

/**
 * テキストを解析してリストに表示する
 */
async function analyzeAndDisplay(text) {
  const tokens = tokenizer.tokenize(text);
  const nouns = new Set();

  tokens.forEach(token => {
    if (token.pos === '名詞') {
      nouns.add(token.surface_form);
    }
  });

  const wordList = document.getElementById('word-list');
  wordList.innerHTML = '';
  currentWords = [];

  const nounsArray = Array.from(nouns).filter(w => w.length > 1);
  for (const word of nounsArray) {
    await addWordToList(word);
  }
}

/**
 * 単語をテーブルに追加する
 */
async function addWordToList(word, isManual = false) {
  const wordList = document.getElementById('word-list');

  if (currentWords.includes(word)) return;
  currentWords.push(word);

  const row = document.createElement('tr');
  row.className = 'word-row';

  const dictMatch = getDictMatch(word);

  row.innerHTML = `
    <td><input type="checkbox" class="m3-checkbox apply-check" ${dictMatch ? 'checked' : ''}></td>
    <td><span class="body-large word-origin">${escapeHtml(word)}</span></td>
    <td>
      <div class="m3-text-field">
        <input type="text" class="replace-input" value="${dictMatch ? dictMatch.target : ''}" list="dict-${word}">
        <datalist id="dict-${word}">
          ${dictMatch ? dictMatch.candidates.map(c => `<option value="${escapeHtml(c)}">`).join('') : ''}
        </datalist>
      </div>
    </td>
    <td><input type="checkbox" class="m3-checkbox dict-check" ${isManual ? 'checked' : ''}></td>
    <td><button class="m3-button m3-button-text single-exec">実行</button></td>
  `;

  const replaceInput = row.querySelector('.replace-input');
  const applyCheck = row.querySelector('.apply-check');
  const dictCheck = row.querySelector('.dict-check');

  // 既知の単語なら辞書登録チェックボックスを制御
  if (dictMatch && dictMatch.candidates.includes(replaceInput.value)) {
    dictCheck.disabled = true;
  }

  replaceInput.addEventListener('input', () => {
    const val = replaceInput.value;
    if (val.trim() !== '') {
      applyCheck.checked = true;
      // 既存の候補にあるか
      const currentCandidates = dictMatch ? dictMatch.candidates : [];
      if (currentCandidates.includes(val)) {
        dictCheck.checked = false;
        dictCheck.disabled = true;
      } else {
        dictCheck.checked = true;
        dictCheck.disabled = false;
      }
    } else {
      // 空文字 (削除)
      applyCheck.checked = true;
      dictCheck.checked = false;
      dictCheck.disabled = false;
    }
  });

  row.querySelector('.single-exec').addEventListener('click', () => {
    const target = replaceInput.value;
    executeReplacement(word, target);
    if (dictCheck.checked && !dictCheck.disabled) {
      saveToDictionary(word, target);
      dictCheck.disabled = true;
    }
  });

  wordList.appendChild(row);
}

function getDictMatch(word) {
  const matches = [];
  for (const [target, origins] of Object.entries(localDictionary)) {
    if (origins.includes(word)) {
      matches.push(target);
    }
  }

  if (matches.length > 0) {
    return {
      target: matches[0],
      candidates: matches
    };
  }
  return null;
}

function saveToDictionary(origin, target) {
  if (!localDictionary[target]) {
    localDictionary[target] = [];
  }
  if (!localDictionary[target].includes(origin)) {
    localDictionary[target].push(origin);
    chrome.storage.local.set({ dictionary: localDictionary });
  }
}

function executeReplacement(origin, target) {
  const mode = document.getElementById('mode-toggle').checked ? 'emulation' : 'dom';
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'REPLACE_WORD',
        origin,
        target,
        mode
      });
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'TAB_CHANGED') {
    // タブが切り替わったら一旦リストをクリアする（混乱を防ぐため）
    const wordList = document.getElementById('word-list');
    wordList.innerHTML = '';
    currentWords = [];

    // 切り替え先のURLでモードを自動判定
    chrome.tabs.get(request.tabId, (tab) => {
      if (tab && tab.url) {
        autoSetMode(tab.url);
      }
    });
  }
});

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
