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

    // Terrain selection state (UI only)
    this._terrainSelected = null; // 'sand' | 'dirt' | 'path' | 'grass' | 'gravel' | null

    this._createStyles();
    this._createPanel();
    this._addEventListeners();
  }

  setMarkerToggle(on) {
    if (this.markerToggleEl) this.markerToggleEl.checked = !!on;
  }

  clearTerrainSelection() {
    this._terrainSelected = null;
    if (this.terrainListEl) {
      this.terrainListEl
        .querySelectorAll('.terrain-item.selected')
        .forEach(el => el.classList.remove('selected'));
    }
  }

  _createGridTabContent() {
    const wrap = document.createElement('div');

    // Row 1: grid size + generate
    const row1 = document.createElement('div');
    row1.className = 'panel-row';

    const label = document.createElement('label');
    label.textContent = 'Grid Size';

    this.widthInput = document.createElement('input');
    this.widthInput.type = 'number';
    this.widthInput.value = 10;
    this.widthInput.min = 2;
    this.widthInput.max = 200;

    const sep = document.createElement('span');
    sep.textContent = 'x';

    this.heightInput = document.createElement('input');
    this.heightInput.type = 'number';
    this.heightInput.value = 10;
    this.heightInput.min = 2;
    this.heightInput.max = 200;

    this.generateButton = document.createElement('button');
    this.generateButton.textContent = 'Generate';
    this.generateButton.className = 'generate-btn';

    row1.append(label, this.widthInput, sep, this.heightInput, this.generateButton);

    // Row 2: Marker Mode toggle
    const row2 = document.createElement('div');
    row2.className = 'panel-row';
    row2.style.marginTop = '8px';

    const tlabel = document.createElement('label');
    tlabel.textContent = 'Marker Mode';

    const toggleWrap = document.createElement('label');
    toggleWrap.className = 'switch';
    this.markerToggleEl = document.createElement('input');
    this.markerToggleEl.type = 'checkbox';
    this.markerToggleEl.className = 'marker-toggle';
    const slider = document.createElement('span');
    slider.className = 'slider';
    toggleWrap.append(this.markerToggleEl, slider);

    const hint = document.createElement('span');
    hint.className = 'muted';
    hint.textContent = 'Tap tiles to mark red. Turning OFF locks them as non-walkable.';

    row2.append(tlabel, toggleWrap, hint);

    // Row 3: Show tile outlines toggle
    const row3 = document.createElement('div');
    row3.className = 'panel-row';
    const olabel = document.createElement('label');
    olabel.textContent = 'Show tile outlines';
    const owrap = document.createElement('label');
    owrap.className = 'switch';
    this.outlineToggleEl = document.createElement('input');
    this.outlineToggleEl.type = 'checkbox';
    this.outlineToggleEl.className = 'outline-toggle';
    const oslider = document.createElement('span');
    oslider.className = 'slider';
    owrap.append(this.outlineToggleEl, oslider);
    row3.append(olabel, owrap);

    const wrapAll = document.createElement('div');
    wrapAll.append(row1, row2, row3);
    return wrapAll;
  }

  _createTerrainTabContent() {
    const wrap = document.createElement('div');
    wrap.className = 'panel-col';

    const makeItem = (key, label, styleBg) => {
      const btn = document.createElement('button');
      btn.className = 'terrain-item';
      btn.dataset.type = key;
      btn.innerHTML = `<span class="thumb"></span><span class="label">${label}</span>`;
      btn.querySelector('.thumb').style.background = styleBg;
      return btn;
    };

    this.terrainListEl = document.createElement('div');
    this.terrainListEl.className = 'terrain-scroller';

    const items = [
      ['sand',   'Sand',   'linear-gradient(135deg,#d8c6a3,#cdb88f)'],
      ['dirt',   'Dirt',   'linear-gradient(135deg,#8b5a2b,#6f451f)'],
      ['path',   'Path',   'linear-gradient(135deg,#bfbfbf,#8d8d8d)'],
      ['grass',  'Grass',  'linear-gradient(135deg,#3aa83a,#2e7d32)'],
      ['gravel', 'Gravel', 'repeating-linear-gradient(135deg,#9a9a9a,#9a9a9a 6px,#8a8a8a 6px,#8a8a8a 12px)']
    ];

    items.forEach(([k, lbl, bg]) => this.terrainListEl.appendChild(makeItem(k, lbl, bg)));
    this.clearTerrainSelection();

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Tap a texture to start painting tiles (tap again to stop).';

    wrap.appendChild(this.terrainListEl);
    wrap.appendChild(hint);
    return wrap;
  }

  _createHeightTabContent() {
    const wrap = document.createElement('div');
    wrap.className = 'panel-col';

    // Row 1: Toggles
    const row1 = document.createElement('div');
    row1.className = 'panel-row';

    const t1label = document.createElement('label');
    t1label.textContent = 'Height Mode';

    const toggle1 = document.createElement('label');
    toggle1.className = 'switch';
    this.heightModeEl = document.createElement('input');
    this.heightModeEl.type = 'checkbox';
    const slider1 = document.createElement('span');
    slider1.className = 'slider';
    toggle1.append(this.heightModeEl, slider1);

    const t2label = document.createElement('label');
    t2label.textContent = 'Pin tiles';

    const toggle2 = document.createElement('label');
    toggle2.className = 'switch';
    this.pinModeEl = document.createElement('input');
    this.pinModeEl.type = 'checkbox';
    const slider2 = document.createElement('span');
    slider2.className = 'slider';
    toggle2.append(this.pinModeEl, slider2);

    row1.append(t1label, toggle1, t2label, toggle2);

    // Row 2: Height selector with Up/Down
    const row2 = document.createElement('div');
    row2.className = 'panel-row';

    const hvLabel = document.createElement('label');
    hvLabel.textContent = 'Height';

    this.heightValue = document.createElement('input');
    this.heightValue.type = 'number';
    this.heightValue.value = 0;
    this.heightValue.min = -50;
    this.heightValue.max = 50;
    this.heightValue.step = 1;

    const downBtn = document.createElement('button');
    downBtn.textContent = 'Down';
    downBtn.className = 'height-down';

    const upBtn = document.createElement('button');
    upBtn.textContent = 'Up';
    upBtn.className = 'height-up';

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Pin ON: tap to green-highlight tiles. Pin OFF: tap to set tile height.';

    row2.append(hvLabel, this.heightValue, downBtn, upBtn);

    wrap.append(row1, row2, hint);
    return wrap;
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
    hint.textContent = 'Saves include grid size, character position, camera view, view and paint.';

    wrap.append(row1, row2, hint);
    return wrap;
  }

  _createPanel() {
    this.panelElement.className = 'ui-panel';

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';

    const tabNames = ['Grid', 'Objects', 'Terrain', 'Height', 'Settings'];
    tabNames.forEach((name, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = name;
      b.dataset.tabName = name;
      if (i === 0) { b.classList.add('active'); this.activeTab = b; }
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
      } else if (tabName === 'Terrain') {
        this.contentElement.appendChild(this._createTerrainTabContent());
        this.clearTerrainSelection();
        const evt = new CustomEvent('terrain-tab-opened', {});
        this.panelElement.dispatchEvent(evt);
      } else if (tabName === 'Height') {
        this.contentElement.appendChild(this._createHeightTabContent());
        const evt = new CustomEvent('height-tab-opened', {});
        this.panelElement.dispatchEvent(evt);
      } else if (tabName === 'Settings') {
        this.contentElement.appendChild(this._createSettingsTabContent());
      } else {
        this.contentElement.textContent = `Content for the ${tabName} tab will appear here.`;
      }
    });

    // Delegated clicks in panel content
    this.contentElement.addEventListener('click', (e) => {
      // Generate
      const genBtn = e.target.closest('.generate-btn');
      if (genBtn) {
        const width = Math.max(2, Math.min(200, parseInt(this.widthInput.value, 10) || 10));
        const height = Math.max(2, Math.min(200, parseInt(this.heightInput.value, 10) || 10));
        const evt = new CustomEvent('generate', { detail: { width, height } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Save
      const saveBtn = e.target.closest('.save-btn');
      if (saveBtn) {
        let filename = window.prompt('Name your save file:', 'titanmap.json');
        if (!filename) return;
        if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
        const evt = new CustomEvent('save-project', { detail: { filename } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Load
      const loadBtn = e.target.closest('.load-btn');
      if (loadBtn) {
        this.fileInput.value = '';
        this.fileInput.click();
        return;
      }

      // Terrain item click (toggle select)
      const item = e.target.closest('.terrain-item');
      if (item && this.terrainListEl?.contains(item)) {
        const type = item.dataset.type;
        if (this._terrainSelected === type) {
          // toggle off
          item.classList.remove('selected');
          this._terrainSelected = null;
          const evt = new CustomEvent('terrain-select', { detail: { type, active: false } });
          this.panelElement.dispatchEvent(evt);
        } else {
          // switch to new selection
          this.terrainListEl.querySelectorAll('.terrain-item.selected')
            .forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          this._terrainSelected = type;
          const evt = new CustomEvent('terrain-select', { detail: { type, active: true } });
          this.panelElement.dispatchEvent(evt);
        }
        return;
      }

      // Height up/down
      const up = e.target.closest('.height-up');
      const dn = e.target.closest('.height-down');
      if (up || dn) {
        const v = parseInt(this.heightValue?.value || '0', 10);
        const next = Math.max(-50, Math.min(50, v + (up ? 1 : -1)));
        if (this.heightValue) this.heightValue.value = next;
        const evt = new CustomEvent('height-set', { detail: { value: next } });
        this.panelElement.dispatchEvent(evt);
        return;
      }
    });

    // Change events
    this.panelElement.addEventListener('change', (e) => {
      // outlines toggle
      const outline = e.target.closest('.outline-toggle');
      if (outline) {
        const wantOn = !!outline.checked;
        const evt = new CustomEvent('grid-outline-toggle', { detail: { wantOn } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Marker toggle
      const chk = e.target.closest('.marker-toggle');
      if (chk) {
        const wantOn = !!chk.checked;
        const evt = new CustomEvent('marker-toggle-request', { detail: { wantOn } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Height mode toggle
      if (e.target === this.heightModeEl) {
        const wantOn = !!this.heightModeEl.checked;
        const evt = new CustomEvent('height-toggle-request', { detail: { wantOn } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Pin mode toggle
      if (e.target === this.pinModeEl) {
        const wantOn = !!this.pinModeEl.checked;
        const evt = new CustomEvent('pin-toggle-request', { detail: { wantOn } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Height numeric input changed
      if (e.target === this.heightValue) {
        const v = Math.max(-50, Math.min(50, parseInt(this.heightValue.value || '0', 10)));
        this.heightValue.value = v;
        const evt = new CustomEvent('height-set', { detail: { value: v } });
        this.panelElement.dispatchEvent(evt);
        return;
      }
    });

    // Hidden file input (Load)
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files && this.fileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const evt = new CustomEvent('load-project-data', { detail: { data, filename: file.name } });
        this.panelElement.dispatchEvent(evt);
        } catch {
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
        border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
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
      .panel-col { display: flex; flex-direction: column; gap: 10px; }
      .panel-row label { font-weight: 500; color: #ccc; }
      .panel-row input[type="number"] {
        width: 64px; background: #111; border: 1px solid #444; color: #fff;
        padding: 8px; border-radius: 2px; text-align: center;
      }
      .panel-row span { color: #777; font-weight: bold; }
      .muted { color: #8a8d92; font-weight: 400; font-size: 12px; }
      .generate-btn, .save-btn, .load-btn {
        background: #00aaff; color: #fff; border: none; padding: 8px 16px;
        border-radius: 2px; font-weight: 600; cursor: pointer;
      }
      .load-btn { background: #6a5acd; }
      .hint { opacity: 0.7; font-size: 12px; margin-top: 4px; }

      /* pretty switch */
      .switch { position: relative; display: inline-block; width: 44px; height: 24px; margin-left: 6px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; cursor: pointer; inset: 0;
        background: #3a3d46; transition: .2s; border-radius: 999px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
      }
      .slider:before {
        position: absolute; content: "";
        height: 18px; width: 18px; left: 3px; top: 3px;
        background: #fff; border-radius: 50%; transition: .2s;
      }
      input:checked + .slider { background: #00aaff; }
      input:checked + .slider:before { transform: translateX(20px); }

      /* Terrain scroller */
      .terrain-scroller {
        display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px;
        -webkit-overflow-scrolling: touch;
      }
      .terrain-item {
        min-width: 84px; max-width: 84px; border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04); border-radius: 8px; padding: 8px;
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        cursor: pointer;
      }
      .terrain-item .thumb {
        width: 64px; height: 64px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
      }
      .terrain-item .label { font-size: 12px; color: #dcdde2; }
      .terrain-item.selected { outline: 2px solid #00aaff; outline-offset: 2px; }
    `;
    document.head.appendChild(style);
  }
}