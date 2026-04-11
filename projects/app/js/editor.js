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
function loadDictionary() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['dictionary'], (result) => {
      if (result.dictionary) {
        localDictionary = result.dictionary;
      } else {
        localDictionary = DEFAULT_DICTIONARY;
        saveToStorage();
      }
      renderDictionary();
    });
  } else {
    localDictionary = DEFAULT_DICTIONARY;
    renderDictionary();
  }
}

// Save dictionary to chrome storage
function saveToStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ dictionary: localDictionary }, () => {
      console.log('Replace-Solo: Dictionary saved to storage');
    });
  }
}

// Render dictionary table
function renderDictionary() {
  const dictionaryList = document.getElementById('dictionary-list');
  dictionaryList.innerHTML = '';

  for (const [target, origins] of Object.entries(localDictionary)) {
    addRow(target, origins);
  }
}

// Add row to table
function addRow(targetText = '', origins = []) {
  const dictionaryList = document.getElementById('dictionary-list');
  const row = document.createElement('tr');
  row.className = 'dictionary-row';

  // Target Word Column
  const tdTarget = document.createElement('td');
  const divField = document.createElement('div');
  divField.className = 'm3-text-field';
  const targetInput = document.createElement('input');
  targetInput.type = 'text';
  targetInput.value = targetText;
  targetInput.placeholder = '置換後の文字列';
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
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'm3-icon-button error-text';
  deleteBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
      <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T720-120H280Zm440-600H240v520q0 17 11.5 28.5T280-200h440q17 0 28.5-11.5T760-200v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM240-720v520-520Z"/>
    </svg>
  `;
  deleteBtn.title = '行を削除';
  deleteBtn.addEventListener('click', () => {
    if (confirm('この行を削除しますか？')) {
      const currentTarget = targetInput.value;
      delete localDictionary[targetInput.oldValue || currentTarget];
      row.remove();
      saveToStorage();
    }
  });
  tdActions.appendChild(deleteBtn);

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
        alert('同じ置換文字列が既に存在します。');
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
    tagList.innerHTML = '';
    origins.forEach((word, index) => {
      const pill = document.createElement('div');
      pill.className = 'tag-pill';
      pill.textContent = word;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'tag-remove';
      removeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
          <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
        </svg>
      `;
      removeBtn.addEventListener('click', () => {
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

// Event Listeners for global actions
function setupEventListeners() {
  document.getElementById('add-row-btn').addEventListener('click', () => {
    if (localDictionary.hasOwnProperty('')) {
      alert('未入力の置換文字列があります。');
      return;
    }
    localDictionary[''] = [];
    addRow('', []);
    // Auto-focus the new row's input could be better, but keep it simple
  });
}
