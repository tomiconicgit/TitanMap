// file: ui-panel.js
export class UIPanel {
  constructor(container) {
    this.container = container;
    this.activeTab = null;
    this.panelElement = document.createElement('div');

    // hidden file input for "Load"
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'application/json,.json';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this._createStyles();
    this._createPanel();
    this._addEventListeners();
  }

  _createGridTabContent() {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-row';

    const label = document.createElement('label');
    label.textContent = 'Grid Size';

    this.widthInput = document.createElement('input');
    this.widthInput.type = 'number';
    this.widthInput.value = 30;
    this.widthInput.min = 2;
    this.widthInput.max = 200;

    const separator = document.createElement('span');
    separator.textContent = '×';

    this.heightInput = document.createElement('input');
    this.heightInput.type = 'number';
    this.heightInput.value = 30;
    this.heightInput.min = 2;
    this.heightInput.max = 200;

    this.generateButton = document.createElement('button');
    this.generateButton.textContent = 'Generate';
    this.generateButton.className = 'generate-btn';

    wrapper.append(label, this.widthInput, separator, this.heightInput, this.generateButton);
    return wrapper;
  }

  _createSettingsTabContent() {
    const wrap = document.createElement('div');
    wrap.className = 'panel-col';

    const row1 = document.createElement('div');
    row1.className = 'panel-row';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Save Project…';
    row1.appendChild(saveBtn);

    const row2 = document.createElement('div');
    row2.className = 'panel-row';
    const loadBtn = document.createElement('button');
    loadBtn.className = 'load-btn';
    loadBtn.textContent = 'Load Project…';
    row2.appendChild(loadBtn);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Saves include grid size, character tile, camera view, and editor settings.';

    wrap.append(row1, row2, hint);
    return wrap;
  }

  _createPanel() {
    this.panelElement.className = 'ui-panel';

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';

    const tabNames = ['Grid', 'Objects', 'Terrain', 'Lighting', 'Settings'];
    tabNames.forEach((name, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = name;
      b.dataset.tabName = name;
      if (i === 0) {
        b.classList.add('active');
        this.activeTab = b;
      }
      tabsContainer.appendChild(b);
    });

    this.contentElement = document.createElement('div');
    this.contentElement.className = 'panel-content';
    this.contentElement.appendChild(this._createGridTabContent());

    this.panelElement.appendChild(tabsContainer);
    this.panelElement.appendChild(this.contentElement);
    this.container.appendChild(this.panelElement);
  }

  _addEventListeners() {
    // Switch tabs
    this.panelElement.querySelector('.tabs-container').addEventListener('click', (e) => {
      const clicked = e.target.closest('.tab');
      if (!clicked || clicked === this.activeTab) return;

      this.activeTab.classList.remove('active');
      clicked.classList.add('active');
      this.activeTab = clicked;

      this.contentElement.innerHTML = '';
      const tabName = clicked.dataset.tabName;
      if (tabName === 'Grid') {
        this.contentElement.appendChild(this._createGridTabContent());
      } else if (tabName === 'Settings') {
        this.contentElement.appendChild(this._createSettingsTabContent());
      } else {
        this.contentElement.textContent = `Content for the ${tabName} tab will appear here.`;
      }
    });

    // Grid: Generate
    this.contentElement.addEventListener('click', (e) => {
      const genBtn = e.target.closest('.generate-btn');
      if (genBtn) {
        const width = Math.max(2, Math.min(200, parseInt(this.widthInput.value, 10) || 30));
        const height = Math.max(2, Math.min(200, parseInt(this.heightInput.value, 10) || 30));
        const evt = new CustomEvent('generate', { detail: { width, height } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Settings: Save
      const saveBtn = e.target.closest('.save-btn');
      if (saveBtn) {
        let filename = window.prompt('Name your save file:', 'titanmap.json');
        if (!filename) return;
        if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
        const evt = new CustomEvent('save-project', { detail: { filename } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Settings: Load
      const loadBtn = e.target.closest('.load-btn');
      if (loadBtn) {
        this.fileInput.value = '';
        this.fileInput.click();
      }
    });

    // Handle the hidden file input (Load)
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const evt = new CustomEvent('load-project-data', { detail: { data, filename: file.name } });
          this.panelElement.dispatchEvent(evt);
        } catch (err) {
          alert('Invalid save file (not JSON).');
        }
      };
      reader.onerror = () => alert('Failed to read the file.');
      reader.readAsText(file);
    });
  }

  _createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :root { --safe-bottom: env(safe-area-inset-bottom, 15px); }
      .ui-panel {
        position: fixed; left: 50%; bottom: 15px; transform: translateX(-50%);
        width: calc(100% - 30px); max-width: 700px; z-index: 10;
        background-color: rgba(30, 32, 37, 0.8);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 3px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.3); color: #e8e8ea;
        padding-bottom: var(--safe-bottom); overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .tabs-container { display: flex; border-bottom: 1px solid rgba(255,255,255,0.1); }
      .tab {
        flex: 1; text-align: center; background: none; border: none; padding: 12px 10px; color: #aaa;
        font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
        transition: color 0.2s ease; border-bottom: 2px solid transparent; white-space: nowrap;
      }
      .tab:hover { color: #fff; }
      .tab.active { color: #fff; border-bottom-color: #00aaff; }
      .panel-content { padding: 20px; font-size: 14px; min-height: 40px; }
      .panel-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .panel-col { display: flex; flex-direction: column; }
      .panel-row label { font-weight: 500; color: #ccc; }
      .panel-row input[type="number"] {
        width: 64px; background: #111; border: 1px solid #444; color: #fff;
        padding: 8px; border-radius: 2px; text-align: center;
      }
      .panel-row span { color: #777; font-weight: bold; }
      .generate-btn,
      .save-btn,
      .load-btn {
        background: #00aaff; color: #fff; border: none; padding: 8px 16px;
        border-radius: 2px; font-weight: 600; cursor: pointer;
      }
      .load-btn { background: #6a5acd; }
      .hint { opacity: 0.7; font-size: 12px; margin-top: 4px; }
    `;
    document.head.appendChild(style);
  }
}