/**
 * Replace-Solo Side Panel
 * Handling UI interactions and kuromoji.js integration.
 */

console.log('Replace-Solo: Side Panel Loaded');

// URLパラメータから tabId を取得
const urlParams = new URLSearchParams(window.location.search);
const targetTabId = parseInt(urlParams.get('tabId'), 10);
console.log('Target Tab ID:', targetTabId);

let tokenizer = null;
let currentWords = []; // 現在リストされている単語
let localDictionary = {}; // {"target": ["origin1", "origin2", ...]}
let rowCounter = 0;

// kuromoji.js の初期化
kuromoji.builder({ dicPath: '../lib/kuromoji/dict/' }).build((err, _tokenizer) => {
  if (err) {
    console.error('kuromoji initialization error:', err);
    return;
  }
  tokenizer = _tokenizer;
  console.log('kuromoji.js initialized');
});

// 初期データの読み込みと辞書更新の購読
function loadDictionary() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['dictionary'], (result) => {
      if (result.dictionary) {
        localDictionary = result.dictionary;
        console.log('Replace-Solo: Local dictionary loaded');
      } else {
        localDictionary = {
          "": ["えー", "えーっと", "あのー", "そのー"]
        };
        chrome.storage.local.set({ dictionary: localDictionary });
      }
    });
  } else {
    localDictionary = { "": ["えー", "えーっと", "あのー", "そのー"] };
  }
}

loadDictionary();

// バージョン情報の読み込み
function loadVersion() {
  fetch('../version.json')
    .then(response => response.json())
    .then(data => {
      document.getElementById('app-version').innerText = `v${data.version}`;
    })
    .catch(err => {
      console.error('Failed to load version:', err);
      // フォールバック: manifestから取得
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        document.getElementById('app-version').innerText = `v${manifest.version}`;
      }
    });
}

loadVersion();

// 辞書が他タブのパネル等で更新されたら反映する
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dictionary) {
      localDictionary = changes.dictionary.newValue;
      console.log('Replace-Solo: Local dictionary updated from storage');
    }
  });
}

// 初期化：ターゲットタブのURLに基づいてモードを設定
if (targetTabId && typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.get(targetTabId, (tab) => {
    if (tab && tab.url) {
      autoSetMode(tab.url);
    }
  });
}

// UI Event Listeners
document.getElementById('analyze-btn').addEventListener('click', () => {
  if (!tokenizer) {
    alert('形態素解析エンジンの準備中です。少々お待ちください。');
    return;
  }

  // targetTabId がある場合はそれを使用、なければフォールバック
  const activeId = targetTabId;
  if (activeId) {
    chrome.tabs.get(activeId, (tab) => {
      if (tab) {
        autoSetMode(tab.url || "");
        chrome.tabs.sendMessage(activeId, { action: 'EXTRACT_TEXT' }, (response) => {
          if (response && response.text) {
            analyzeAndDisplay(response.text);
          }
        });
      }
    });
  }
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
  const replacements = [];
  rows.forEach(row => {
    const applyCheck = row.querySelector('.apply-check');
    if (applyCheck.checked) {
      const origin = row.querySelector('.word-origin').innerText;
      const target = row.querySelector('.replace-input').value;
      const dictCheck = row.querySelector('.dict-check');

      replacements.push({ origin, target });

      if (dictCheck.checked && !dictCheck.disabled) {
        saveToDictionary(origin, target);
        row.querySelector('.dict-check').disabled = true;
      }
    }
  });

  if (replacements.length > 0) {
    executeMultipleReplacements(replacements);
  }
});

document.getElementById('reset-btn').addEventListener('click', () => {
  document.getElementById('word-list').innerHTML = '';
  currentWords = [];
  document.getElementById('analyze-btn').click();
});

// Settings Modal Logic
const settingsModal = document.getElementById('settings-modal');
const settingsOpenBtn = document.getElementById('settings-open-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');

settingsOpenBtn.addEventListener('click', () => {
  settingsModal.style.display = 'flex';
});

settingsCloseBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    settingsModal.style.display = 'none';
  }
});

// Tabs Logic
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');

    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(`tab-${targetTab}`).classList.add('active');
  });
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
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (re) => {
      try {
        const imported = JSON.parse(re.target.result);
        if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
          throw new Error('JSONのルートはオブジェクトである必要があります。');
        }
        for (const [key, value] of Object.entries(imported)) {
          if (!Array.isArray(value)) {
            throw new Error(`キー "${key}" の値が配列ではありません。`);
          }
        }

        if (confirm('辞書を上書きしますか？（キャンセルで追加）')) {
          localDictionary = imported;
        } else {
          for (const [target, origins] of Object.entries(imported)) {
            if (localDictionary[target]) {
              localDictionary[target] = [...new Set([...localDictionary[target], ...origins])];
            } else {
              localDictionary[target] = [...origins];
            }
          }
        }

        chrome.storage.local.set({ dictionary: localDictionary }, () => {
          alert('インポートが完了しました。');
          const analyzeBtn = document.getElementById('analyze-btn');
          if (analyzeBtn) analyzeBtn.click();
        });
      } catch (err) {
        console.error('Import error:', err);
        alert('インポートに失敗しました: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

async function analyzeAndDisplay(text) {
  const tokens = tokenizer.tokenize(text);
  const nouns = new Set();
  const dictOrigins = new Set();
  for (const origins of Object.values(localDictionary)) {
    origins.forEach(o => dictOrigins.add(o));
  }

  tokens.forEach(token => {
    if (token.pos === '名詞' || dictOrigins.has(token.surface_form)) {
      nouns.add(token.surface_form);
    }
  });

  const wordList = document.getElementById('word-list');
  wordList.innerHTML = '';
  currentWords = [];
  rowCounter = 0;

  const nounsArray = Array.from(nouns).filter(w => {
    if (dictOrigins.has(w)) return true;
    return w.length > 1;
  });

  const BATCH_SIZE = 50;
  for (let i = 0; i < nounsArray.length; i += BATCH_SIZE) {
    const batch = nounsArray.slice(i, i + BATCH_SIZE);
    for (const word of batch) {
      await addWordToList(word);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function addWordToList(word, isManual = false) {
  const wordList = document.getElementById('word-list');
  if (currentWords.includes(word)) return;
  currentWords.push(word);

  const row = document.createElement('tr');
  row.className = 'word-row';
  const dictMatch = getDictMatch(word);
  const rowId = rowCounter++;

  row.innerHTML = `
    <td><input type="checkbox" class="m3-checkbox apply-check" ${dictMatch ? 'checked' : ''}></td>
    <td><span class="body-large word-origin">${escapeHtml(word)}</span></td>
    <td>
      <div class="m3-text-field compact">
        <input type="text" class="replace-input" value="${dictMatch ? escapeHtml(dictMatch.target) : ''}" list="dict-${rowId}">
        <datalist id="dict-${rowId}">
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

  if (dictMatch && dictMatch.candidates.includes(replaceInput.value)) {
    dictCheck.disabled = true;
  }

  replaceInput.addEventListener('input', () => {
    const val = replaceInput.value;
    if (val.trim() !== '') {
      applyCheck.checked = true;
      const currentCandidates = dictMatch ? dictMatch.candidates : [];
      if (currentCandidates.includes(val)) {
        dictCheck.checked = false;
        dictCheck.disabled = true;
      } else {
        dictCheck.checked = true;
        dictCheck.disabled = false;
      }
    } else {
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
    return { target: matches[0], candidates: matches };
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
  executeMultipleReplacements([{ origin, target }]);
}

function executeMultipleReplacements(replacements) {
  const mode = document.getElementById('mode-toggle').checked ? 'emulation' : 'dom';
  if (targetTabId) {
    chrome.tabs.sendMessage(targetTabId, {
      action: 'REPLACE_WORDS',
      replacements,
      mode
    });
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
