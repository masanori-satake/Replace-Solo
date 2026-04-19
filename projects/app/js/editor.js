/**
 * Replace-Solo Dictionary Editor Logic
 */

let localDictionary = {};
const DEFAULT_DICTIONARY = { "": ["えー", "えーっと", "あのー", "そのー"] };

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadDictionary();
  setupEventListeners();
});

// Load dictionary from chrome storage
async function loadDictionary() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const result = await chrome.storage.local.get(['dictionary']);
      if (result.dictionary) {
        localDictionary = result.dictionary;
        // Ensure system deletion entry exists
        if (!localDictionary.hasOwnProperty('')) {
          localDictionary[''] = [];
          await saveToStorage();
        }
      } else {
        localDictionary = JSON.parse(JSON.stringify(DEFAULT_DICTIONARY));
        await saveToStorage();
      }
    } catch (error) {
      console.error('Replace-Solo: Failed to load dictionary:', error);
      localDictionary = JSON.parse(JSON.stringify(DEFAULT_DICTIONARY));
    }
    renderDictionary();
  } else {
    localDictionary = JSON.parse(JSON.stringify(DEFAULT_DICTIONARY));
    renderDictionary();
  }
}

// Save dictionary to chrome storage
async function saveToStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      await chrome.storage.local.set({ dictionary: localDictionary });
      console.log('Replace-Solo: Dictionary saved to storage');
    } catch (error) {
      console.error('Replace-Solo: Failed to save dictionary:', error);
    }
  }
}

// Render dictionary table
function renderDictionary() {
  const dictionaryList = document.getElementById('dictionary-list');
  while (dictionaryList.firstChild) {
    dictionaryList.removeChild(dictionaryList.firstChild);
  }

  for (const [target, origins] of Object.entries(localDictionary)) {
    addRow(target, origins);
  }
}

// Add row to table
function addRow(targetText = '', origins = []) {
  const dictionaryList = document.getElementById('dictionary-list');
  const row = document.createElement('tr');
  row.className = 'dictionary-row';

  const isDeletionEntry = (targetText === '');

  // Target Word Column
  const tdTarget = document.createElement('td');
  const divField = document.createElement('div');
  divField.className = 'm3-text-field';
  const targetInput = document.createElement('input');
  targetInput.type = 'text';
  targetInput.value = targetText;
  if (isDeletionEntry) {
    targetInput.placeholder = '（削除）';
    targetInput.readOnly = true;
    targetInput.style.backgroundColor = 'var(--m3-sys-light-surface-variant)';
    targetInput.style.cursor = 'not-allowed';
  } else {
    targetInput.placeholder = '置換後の文字列';
  }
  divField.appendChild(targetInput);
  tdTarget.appendChild(divField);

  // Origin Words Column
  const tdOrigins = document.createElement('td');
  const tagEditor = createTagEditor(origins, (newOrigins) => {
    // Save target before updating key
    const currentTarget = targetInput.value;
    updateOrigins(targetInput.oldValue || targetText, currentTarget, newOrigins);
    targetInput.oldValue = currentTarget;
  });
  tdOrigins.appendChild(tagEditor);

  // Actions Column
  const tdActions = document.createElement('td');
  if (!isDeletionEntry) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'm3-icon-button error-text';
    deleteBtn.title = '行を削除';

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("height", "24px");
    svg.setAttribute("viewBox", "0 -960 960 960");
    svg.setAttribute("width", "24px");
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T720-120H280Zm440-600H240v520q0 17 11.5 28.5T280-200h440q17 0 28.5-11.5T760-200v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM240-720v520-520Z");
    svg.appendChild(path);
    deleteBtn.appendChild(svg);

    deleteBtn.addEventListener('click', () => {
      showConfirm('この行を削除しますか？', () => {
        const currentTarget = targetInput.value;
        delete localDictionary[targetInput.oldValue || currentTarget];
        row.remove();
        saveToStorage();
      });
    });
    tdActions.appendChild(deleteBtn);
  }
  row.appendChild(tdTarget);
  row.appendChild(tdOrigins);
  row.appendChild(tdActions);

  // Keep track of old target for updating localDictionary keys
  targetInput.oldValue = targetText;

  targetInput.addEventListener('change', () => {
    const newTarget = targetInput.value;
    const oldTarget = targetInput.oldValue;
    if (newTarget !== oldTarget) {
      if (localDictionary.hasOwnProperty(newTarget)) {
        showAlert('同じ置換文字列が既に存在します。');
        targetInput.value = oldTarget;
        return;
      }
      const originsValue = localDictionary[oldTarget] || [];
      delete localDictionary[oldTarget];
      localDictionary[newTarget] = originsValue;
      targetInput.oldValue = newTarget;
      saveToStorage();
    }
  });

  dictionaryList.appendChild(row);
}

// Create Tag Editor (Origin words)
function createTagEditor(initialOrigins, onChange) {
  const container = document.createElement('div');
  container.className = 'tag-editor';

  const tagList = document.createElement('div');
  tagList.className = 'tag-list';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = '元単語を追加 (カンマまたはEnter)';

  let origins = [...initialOrigins];

  const updateTagsUI = () => {
    while (tagList.firstChild) {
      tagList.removeChild(tagList.firstChild);
    }
    origins.forEach((word, index) => {
      const pill = document.createElement('div');
      pill.className = 'tag-pill';
      pill.textContent = word;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'tag-remove';

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("height", "16px");
      svg.setAttribute("viewBox", "0 -960 960 960");
      svg.setAttribute("width", "16px");
      svg.setAttribute("fill", "currentColor");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z");
      svg.appendChild(path);
      removeBtn.appendChild(svg);

      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        origins.splice(index, 1);
        updateTagsUI();
        onChange(origins);
      });

      pill.appendChild(removeBtn);
      tagList.appendChild(pill);
    });
  };

  const addTag = () => {
    const value = input.value.trim().replace(/,$/, '');
    if (value && !origins.includes(value)) {
      origins.push(value);
      input.value = '';
      updateTagsUI();
      onChange(origins);
    } else {
      input.value = '';
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && input.value === '' && origins.length > 0) {
      origins.pop();
      updateTagsUI();
      onChange(origins);
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim() !== '') {
      addTag();
    }
  });

  updateTagsUI();
  container.appendChild(tagList);
  container.appendChild(input);

  // Click container to focus input
  container.addEventListener('click', () => {
    input.focus();
  });

  return container;
}

// Update origins for a target
function updateOrigins(oldTarget, currentTarget, newOrigins) {
  const target = currentTarget || oldTarget;
  localDictionary[target] = newOrigins;
  saveToStorage();
}

// Dialog helper functions
function showConfirm(message, onOk) {
  const dialog = document.getElementById('confirm-dialog');
  const messageEl = document.getElementById('confirm-message');
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');

  messageEl.textContent = message;
  dialog.style.display = 'flex';

  const close = () => {
    dialog.style.display = 'none';
    okBtn.removeEventListener('click', okHandler);
    cancelBtn.removeEventListener('click', cancelHandler);
  };

  const okHandler = () => {
    onOk();
    close();
  };
  const cancelHandler = () => {
    close();
  };

  okBtn.addEventListener('click', okHandler);
  cancelBtn.addEventListener('click', cancelHandler);
}

function showAlert(message) {
  const dialog = document.getElementById('alert-dialog');
  const messageEl = document.getElementById('alert-message');
  const okBtn = document.getElementById('alert-ok');

  messageEl.textContent = message;
  dialog.style.display = 'flex';

  const okHandler = () => {
    dialog.style.display = 'none';
    okBtn.removeEventListener('click', okHandler);
  };

  okBtn.addEventListener('click', okHandler);
}

function showPrompt(title, message, onOk) {
  const dialog = document.getElementById('prompt-dialog');
  const titleEl = document.getElementById('prompt-title');
  const messageEl = document.getElementById('prompt-message');
  const inputEl = document.getElementById('prompt-input');
  const okBtn = document.getElementById('prompt-ok');
  const cancelBtn = document.getElementById('prompt-cancel');

  titleEl.textContent = title;
  messageEl.textContent = message;
  inputEl.value = '';
  dialog.style.display = 'flex';
  inputEl.focus();

  const close = () => {
    dialog.style.display = 'none';
    okBtn.removeEventListener('click', okHandler);
    cancelBtn.removeEventListener('click', cancelHandler);
    inputEl.removeEventListener('keydown', keyHandler);
  };

  const okHandler = () => {
    const value = inputEl.value.trim();
    if (value === '') {
      showAlert('置換後の文字列を入力してください。');
      return;
    }
    if (localDictionary.hasOwnProperty(value)) {
      showAlert('同じ置換文字列が既に存在します。');
      return;
    }
    onOk(value);
    close();
  };
  const cancelHandler = () => {
    close();
  };
  const keyHandler = (e) => {
    if (e.key === 'Enter') {
      okHandler();
    }
  };

  okBtn.addEventListener('click', okHandler);
  cancelBtn.addEventListener('click', cancelHandler);
  inputEl.addEventListener('keydown', keyHandler);

}

// Event Listeners for global actions
function setupEventListeners() {
  document.getElementById('add-row-btn').addEventListener('click', () => {
    showPrompt('新規行を追加', '追加する置換後の文字列を入力してください。', (newTarget) => {
      localDictionary[newTarget] = [];
      addRow(newTarget, []);
      saveToStorage();
    });
  });

  // Listen for storage changes to sync across tabs if needed
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.dictionary) {
        const newDict = changes.dictionary.newValue || {};
        // Enforce system deletion entry existence even when updated from other tabs
        if (!newDict.hasOwnProperty('')) {
          newDict[''] = [];
        }
        localDictionary = newDict;
        renderDictionary();
      }
    });
  }
}
