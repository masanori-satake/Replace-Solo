/**
 * Replace-Solo Side Panel
 * Handling UI interactions and kuromoji.js integration.
 */

console.log('Replace-Solo: Side Panel Loaded');

let tokenizer = null;
let allExtractedWords = []; // 抽出されたすべての単語（フィルタリング前）
let lastExtractedData = {
  text: "",
  tokens: [],
  extractedWords: []
};
let manualWords = new Set(); // 手動で追加された単語
let currentWords = new Set(); // 現在リストされている単語（重複チェック用）
let localDictionary = {}; // {"target": ["origin1", "origin2", ...]}
let dictOrigins = new Set(); // キャッシュ: 全ての元単語のSet
let reverseDictionary = {}; // キャッシュ: {"origin": ["target1", "target2", ...]}
let rowCounter = 0;

// 定数定義
const EXCLUDED_NOUN_TYPES = new Set(['代名詞', '非自立']);
const DEFAULT_DICTIONARY = { "": ["えー", "えーっと", "あのー", "そのー"] };
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF66-\uFF9F]/;
const IDENTIFIER_REGEX = /^[a-zA-Z0-9.\-_@]{3,}$/;
const TRIM_SYMBOLS_SET = '[\\s()\\[\\]{}<>（）［］｛｝〈〉《》「」『』【】〔〕〖〗〘〙〚〛\'"`“”‘’。、！？!?:;：；・,.，．･+*\\/\\\\|~〜～=#$%\\^&@_…-]';
const TRIM_SYMBOLS_REGEX = new RegExp(`^${TRIM_SYMBOLS_SET}+|${TRIM_SYMBOLS_SET}+$`, 'g');

// kuromoji.js の初期化
kuromoji.builder({ dicPath: '../lib/kuromoji/dict/' }).build((err, _tokenizer) => {
  if (err) {
    console.error('kuromoji initialization error:', err);
    return;
  }
  tokenizer = _tokenizer;
  console.log('kuromoji.js initialized');
});

// 辞書のキャッシュ（Set/Map形式）を更新する
function updateDictCache() {
  dictOrigins.clear();
  reverseDictionary = {};

  for (const [target, origins] of Object.entries(localDictionary)) {
    origins.forEach(origin => {
      dictOrigins.add(origin);
      if (!reverseDictionary[origin]) {
        reverseDictionary[origin] = [];
      }
      if (!reverseDictionary[origin].includes(target)) {
        reverseDictionary[origin].push(target);
      }
    });
  }
}

// 初期データの読み込みと辞書更新の購読
async function loadDictionary() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const result = await chrome.storage.local.get(['dictionary']);
      if (result.dictionary) {
        localDictionary = result.dictionary;
        console.log('Replace-Solo: Local dictionary loaded');
      } else {
        localDictionary = DEFAULT_DICTIONARY;
        await chrome.storage.local.set({ dictionary: localDictionary });
      }
    } catch (error) {
      console.error('Replace-Solo: Failed to load dictionary:', error);
      localDictionary = DEFAULT_DICTIONARY;
    }
    updateDictCache();
  } else {
    localDictionary = DEFAULT_DICTIONARY;
    updateDictCache();
  }
}

loadDictionary();

// バージョン情報の読み込み
function loadVersion() {
  fetch('../version.json')
    .then(response => response.json())
    .then(data => {
      const versionElem = document.getElementById('app-version');
      versionElem.textContent = `v${data.version}`;
      setupDebugTrigger(versionElem);
    })
    .catch(err => {
      console.error('Failed to load version:', err);
      // フォールバック: manifestから取得
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        const versionElem = document.getElementById('app-version');
        versionElem.textContent = `v${manifest.version}`;
        setupDebugTrigger(versionElem);
      }
    });
}

/**
 * バージョン番号の連打（500ms以内に3回クリック）でデバッグタブを表示する
 */
function setupDebugTrigger(element) {
  let clickCount = 0;
  let lastClickTime = 0;

  element.addEventListener('click', () => {
    const currentTime = new Date().getTime();
    if (currentTime - lastClickTime < 500) {
      clickCount++;
    } else {
      clickCount = 1;
    }
    lastClickTime = currentTime;

    if (clickCount >= 3) {
      const debugTabBtn = document.getElementById('debug-tab-btn');
      if (debugTabBtn) {
        debugTabBtn.style.display = 'flex';
      }
    }
  });
}

loadVersion();

// 辞書が他タブのパネル等で更新されたら反映する
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dictionary) {
      localDictionary = changes.dictionary.newValue;
      updateDictCache();
      console.log('Replace-Solo: Local dictionary updated from storage');
    }
  });
}

/**
 * 現在アクティブなタブを取得する
 */
async function getActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch (e) {
    return null;
  }
}

/**
 * タブに対してメッセージを送信する。
 * コンテンツスクリプトが未注入の場合は注入を試みる。
 */
async function sendMessageToTab(tabId, message) {
  if (!tabId || typeof chrome === 'undefined' || !chrome.tabs) {
    throw new Error('有効なタブIDが見つかりません。');
  }

  const doSend = () => {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  };

  try {
    return await doSend();
  } catch (error) {
    if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
      console.log('Content script not found. Attempting to inject...');
      // スクリプトを注入して再試行
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['scripts/content.js']
        });
        // 注入後、メッセージを受け取れるようになるまで僅かに待機
        await new Promise(resolve => setTimeout(resolve, 100));
        return await doSend();
      } catch (injectError) {
        console.error('Injection failed:', injectError);
        throw new Error('このページでは拡張機能を使用できません（Chromeの設定ページや保護されたページなど）。ページを再読み込みしてから再度お試しください。');
      }
    }
    throw error;
  }
}

// UI Event Listeners
document.getElementById('extract-btn').addEventListener('click', async () => {
  if (!tokenizer) {
    alert('形態素解析エンジンの準備中です。少々お待ちください。');
    return;
  }

  const toggle = document.getElementById('japanese-only-toggle');
  if (toggle) toggle.checked = true;

  const tab = await getActiveTab();
  if (tab && tab.id) {
    try {
      const response = await sendMessageToTab(tab.id, { action: 'EXTRACT_TEXT' });
      if (response && response.text) {
        extractAndDisplay(response.text);
      }
    } catch (error) {
      console.error('Extraction failed:', error);
      alert(error.message);
    }
  } else {
    alert('操作対象のタブが見つかりません。');
  }
});


document.getElementById('add-word-btn').addEventListener('click', () => {
  const manualWord = document.getElementById('manual-word').value.trim();
  if (manualWord) {
    if (!allExtractedWords.includes(manualWord)) {
      allExtractedWords.push(manualWord);
    }
    manualWords.add(manualWord);
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
      const origin = row.querySelector('.word-origin').textContent;
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

document.getElementById('clear-btn').addEventListener('click', () => {
  const toggle = document.getElementById('japanese-only-toggle');
  if (toggle) toggle.checked = true;
  const wordList = document.getElementById('word-list');
  wordList.textContent = '';
  allExtractedWords = [];
  manualWords.clear();
  currentWords.clear();
});

document.getElementById('reset-btn').addEventListener('click', () => {
  const toggle = document.getElementById('japanese-only-toggle');
  if (toggle) toggle.checked = true;
  const wordList = document.getElementById('word-list');
  wordList.textContent = '';
  allExtractedWords = [];
  manualWords.clear();
  currentWords.clear();
  document.getElementById('extract-btn').click();
});

// Japanese Only Toggle logic
const japaneseOnlyToggle = document.getElementById('japanese-only-toggle');
japaneseOnlyToggle.addEventListener('change', () => {
  renderWordList();
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

settingsModal.addEventListener('click', (event) => {
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
    const tabPanel = document.getElementById(`tab-${targetTab}`);
    if (tabPanel) {
      tabPanel.classList.add('active');
    }
  });
});

document.getElementById('copy-copilot-prompt-btn').addEventListener('click', async () => {
  const btn = document.getElementById('copy-copilot-prompt-btn');
  const originalSvg = btn.innerHTML;
  const checkSvg = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>';

  const dictionary = localDictionary;
  let deletionInstructions = "";
  if (dictionary[""] && dictionary[""].length > 0) {
    deletionInstructions = `（空キーの語句は削除）`;
  }

  const prompt = `💡 AI補正データ (@facilitator 用)
以下のJSONに基づき、"values"を"key"の語句に置換してください。${deletionInstructions}

\`\`\`json
${JSON.stringify(dictionary, null, 2)}
\`\`\`
`;

  try {
    await navigator.clipboard.writeText(prompt);
    btn.innerHTML = checkSvg;
    setTimeout(() => {
      btn.innerHTML = originalSvg;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy prompt:', err);
    alert('プロンプトのコピーに失敗しました。');
  }
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

document.getElementById('download-debug-info').addEventListener('click', () => {
  const data = {
    version: document.getElementById('app-version').textContent,
    timestamp: new Date().toISOString(),
    ...lastExtractedData
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `replace-solo-debug-${new Date().getTime()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const confirmDialog = document.getElementById('confirm-dialog');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');

document.getElementById('clear-dictionary').addEventListener('click', () => {
  confirmDialog.style.display = 'flex';
});

confirmCancelBtn.addEventListener('click', () => {
  confirmDialog.style.display = 'none';
});

confirmOkBtn.addEventListener('click', async () => {
  try {
    localDictionary = DEFAULT_DICTIONARY;
    await chrome.storage.local.set({ dictionary: localDictionary });
    updateDictCache();
    const extractBtn = document.getElementById('extract-btn');
    if (extractBtn) extractBtn.click();
  } catch (error) {
    console.error('Replace-Solo: Failed to clear dictionary:', error);
  } finally {
    confirmDialog.style.display = 'none';
  }
});

document.getElementById('open-editor').addEventListener('click', async () => {
  try {
    const editorUrl = chrome.runtime.getURL('pages/editor.html');
    const tabs = await chrome.tabs.query({ url: editorUrl });
    if (tabs.length > 0) {
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: editorUrl });
    }
  } catch (error) {
    console.debug('Replace-Solo: Failed to open editor:', error);
  }
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

        chrome.storage.local.set({ dictionary: localDictionary })
          .then(() => {
            alert('インポートが完了しました。');
            const extractBtn = document.getElementById('extract-btn');
            if (extractBtn) extractBtn.click();
          })
          .catch((error) => {
            console.error('Import save failed:', error);
            alert('辞書の保存に失敗しました。');
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

async function extractAndDisplay(text) {
  const tokens = tokenizer.tokenize(text);

  // デバッグ用データの保存
  lastExtractedData.text = text;
  lastExtractedData.tokens = tokens;

  const nouns = new Set();

  let i = 0;
  const tokenLen = tokens.length;
  while (i < tokenLen) {
    const token = tokens[i];

    // 開始トークンの判定条件
    const isNoun = token.pos === '名詞' && !EXCLUDED_NOUN_TYPES.has(token.pos_detail_1);
    const isPrefix = token.pos === '接頭詞';
    const isDictMatch = dictOrigins.has(token.surface_form);

    // 日本語を含まない単語（識別子など）の判定
    const firstHasJapanese = JAPANESE_CHAR_REGEX.test(token.surface_form);

    if (isDictMatch || isNoun || isPrefix) {
      let compound = token.surface_form;
      let hasProperNoun = (token.pos_detail_1 === '固有名詞');
      let currentDictMatch = isDictMatch;
      let count = 1;

      let j = i + 1;
      while (j < tokenLen) {
        const nextToken = tokens[j];
        // 複合語の構成要素としては、非自立名詞等も許容する
        const nextIsNoun = nextToken.pos === '名詞';
        const nextIsDictMatch = dictOrigins.has(nextToken.surface_form);

        if (nextIsNoun || nextIsDictMatch) {
          compound += nextToken.surface_form;
          if (nextToken.pos_detail_1 === '固有名詞') hasProperNoun = true;
          if (nextIsDictMatch) currentDictMatch = true;
          count++;
          j++;
        } else {
          break;
        }
      }

      // 複合語全体で辞書にマッチするか確認
      if (!currentDictMatch && dictOrigins.has(compound)) {
        currentDictMatch = true;
      }

      // 前後の記号を除去
      const trimmedCompound = compound.replace(TRIM_SYMBOLS_REGEX, '');

      // トリム後の文字列でも辞書マッチを確認
      if (!currentDictMatch && dictOrigins.has(trimmedCompound)) {
        currentDictMatch = true;
      }

      // 採用条件:
      // 1. 辞書に登録されている
      // 2. 日本語を含んでいる、かつ (固有名詞である OR 2つ以上の名詞が連続している)
      // 3. 日本語を含まないが、識別子（英数字記号）として妥当であり、かつ (固有名詞である OR 2つ以上の名詞が連続している)
      // かつ、1文字のみの一般名詞などは除外する（辞書マッチを除く）
      const hasJapanese = JAPANESE_CHAR_REGEX.test(trimmedCompound);
      const isQualifiedIdentifier = IDENTIFIER_REGEX.test(trimmedCompound);
      const isQualified = currentDictMatch || (trimmedCompound.length > 0 && (hasJapanese || isQualifiedIdentifier) && (hasProperNoun || count > 1));
      const isNotTooShort = currentDictMatch || trimmedCompound.length > 1;

      if (trimmedCompound && isQualified && isNotTooShort) {
        nouns.add(trimmedCompound);
      }
      i = j;
    } else {
      i++;
    }
  }

  const collator = new Intl.Collator('ja');
  allExtractedWords = Array.from(nouns).sort((a, b) => {
    const aHasJapanese = JAPANESE_CHAR_REGEX.test(a);
    const bHasJapanese = JAPANESE_CHAR_REGEX.test(b);

    if (aHasJapanese && !bHasJapanese) return -1;
    if (!aHasJapanese && bHasJapanese) return 1;

    return collator.compare(a, b);
  });

  lastExtractedData.extractedWords = [...allExtractedWords];

  await renderWordList();
}

/**
 * リストを再描画する
 */
async function renderWordList() {
  const wordList = document.getElementById('word-list');
  wordList.textContent = '';
  currentWords.clear();
  rowCounter = 0;

  const toggle = document.getElementById('japanese-only-toggle');
  const isJapaneseOnly = toggle ? toggle.checked : false;

  const BATCH_SIZE = 50;
  for (let i = 0; i < allExtractedWords.length; i += BATCH_SIZE) {
    const batch = allExtractedWords.slice(i, i + BATCH_SIZE);
    const fragment = document.createDocumentFragment();

    for (const word of batch) {
      const row = createWordRow(word, false, isJapaneseOnly);
      if (row) {
        fragment.appendChild(row);
      }
    }
    wordList.appendChild(fragment);

    // 描画サイクルを明け渡してUIのフリーズを防ぐ
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }
}

/**
 * 個別の単語をリストに追加する（手動追加用）
 */
function addWordToList(word, isManual = false) {
  const wordList = document.getElementById('word-list');
  const row = createWordRow(word, isManual, null);
  if (row) {
    wordList.appendChild(row);
  }
}

/**
 * 単語行の要素を作成する
 */
function createWordRow(word, isManual = false, isJapaneseOnly = null) {
  if (currentWords.has(word)) return null;

  if (isJapaneseOnly === null) {
    const toggle = document.getElementById('japanese-only-toggle');
    isJapaneseOnly = toggle ? toggle.checked : false;
  }

  const hasJapanese = JAPANESE_CHAR_REGEX.test(word);
  const isDictMatch = dictOrigins.has(word);
  const isManualInternal = isManual || manualWords.has(word);

  if (isJapaneseOnly && !hasJapanese && !isDictMatch && !isManualInternal) {
    // 辞書外の英単語等はスキップ。ただし手動追加は常に表示
    return null;
  }

  currentWords.add(word);

  const row = document.createElement('tr');
  row.className = 'word-row';
  const dictMatch = getDictMatch(word);
  const rowId = rowCounter++;

  // 選択チェックボックス
  const tdCheck = document.createElement('td');
  const applyCheck = document.createElement('input');
  applyCheck.type = 'checkbox';
  applyCheck.className = 'm3-checkbox apply-check';
  if (dictMatch) applyCheck.checked = true;
  tdCheck.appendChild(applyCheck);
  row.appendChild(tdCheck);

  // 対象単語
  const tdOrigin = document.createElement('td');
  const spanOrigin = document.createElement('span');
  spanOrigin.className = 'body-large word-origin';
  spanOrigin.textContent = word;
  tdOrigin.appendChild(spanOrigin);
  row.appendChild(tdOrigin);

  // 置換文字列入力
  const tdReplace = document.createElement('td');
  const divField = document.createElement('div');
  divField.className = 'm3-text-field compact';
  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.className = 'replace-input';
  replaceInput.value = dictMatch ? dictMatch.target : '';
  replaceInput.setAttribute('list', `dict-${rowId}`);

  const datalist = document.createElement('datalist');
  datalist.id = `dict-${rowId}`;
  if (dictMatch) {
    dictMatch.candidates.forEach(c => {
      const option = document.createElement('option');
      option.value = c;
      datalist.appendChild(option);
    });
  }

  divField.appendChild(replaceInput);
  divField.appendChild(datalist);
  tdReplace.appendChild(divField);
  row.appendChild(tdReplace);

  // 辞書登録チェックボックス
  const tdDict = document.createElement('td');
  const dictCheck = document.createElement('input');
  dictCheck.type = 'checkbox';
  dictCheck.className = 'm3-checkbox dict-check';
  tdDict.appendChild(dictCheck);
  row.appendChild(tdDict);

  // 置換実行ボタン
  const tdExec = document.createElement('td');
  const btnExec = document.createElement('button');
  btnExec.className = 'm3-icon-button single-exec';
  btnExec.title = '置換';

  const svgExec = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgExec.setAttribute('height', '24px');
  svgExec.setAttribute('viewBox', '0 -960 960 960');
  svgExec.setAttribute('width', '24px');
  svgExec.setAttribute('fill', 'currentColor');
  const pathExec = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathExec.setAttribute('d', 'M320-200v-560l440 280-440 280Z');
  svgExec.appendChild(pathExec);

  btnExec.appendChild(svgExec);
  tdExec.appendChild(btnExec);
  row.appendChild(tdExec);

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
        // 置換文字列が入力されても、自動的に辞書登録をONにしない（ユーザーの明示的な操作を優先）
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

  return row;
}

function getDictMatch(word) {
  const matches = reverseDictionary[word];
  if (matches && matches.length > 0) {
    return { target: matches[0], candidates: matches };
  }
  return null;
}

async function saveToDictionary(origin, target) {
  if (!localDictionary[target]) {
    localDictionary[target] = [];
  }
  if (!localDictionary[target].includes(origin)) {
    localDictionary[target].push(origin);
    updateDictCache();
    try {
      await chrome.storage.local.set({ dictionary: localDictionary });
    } catch (error) {
      console.error('Replace-Solo: Failed to save to dictionary:', error);
    }
  }
}

function executeReplacement(origin, target) {
  executeMultipleReplacements([{ origin, target }]);
}

async function executeMultipleReplacements(replacements) {
  const mode = 'emulation';
  const tab = await getActiveTab();
  if (tab && tab.id) {
    try {
      await sendMessageToTab(tab.id, {
        action: 'REPLACE_WORDS',
        replacements,
        mode
      });
    } catch (error) {
      console.error('Replacement failed:', error);
      alert(error.message);
    }
  }
}

