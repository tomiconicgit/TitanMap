// file: ui-panel.js
import { generateTerrainThumbnail } from './procedural-textures.js';

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

    // selection state for Terrain gallery
    this.terrainSelected = 'sand';

    this._createStyles();
    this._createPanel();
    this._addEventListeners();
  }

  /** Public: let main.js reflect the Marker toggle state in the UI */
  setMarkerToggle(on) {
    if (this.markerToggleEl) this.markerToggleEl.checked = !!on;
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
    this.widthInput.value = 30;
    this.widthInput.min = 2;
    this.widthInput.max = 200;

    const sep = document.createElement('span');
    sep.textContent = '×';

    this.heightInput = document.createElement('input');
    this.heightInput.type = 'number';
    this.heightInput.value = 30;
    this.heightInput.min = 2;
    this.heightInput.max = 200;

    this.generateButton = document.createElement('button');
    this.generateButton.textContent = 'Generate';
    this.generateButton.className = 'generate-btn';

    row1.append(label, this.widthInput, sep, this.heightInput, this.generateButton);

    // Row 2: Marker toggle
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

    const wrapAll = document.createElement('div');
    wrapAll.append(row1, row2);
    return wrapAll;
  }

  _createTerrainTabContent() {
    // Horizontal scroll gallery with six types
    const wrap = document.createElement('div');
    wrap.className = 'terrain-wrap';

    const title = document.createElement('div');
    title.className = 'terrain-title';
    title.textContent = 'Procedural Terrain Materials';
    wrap.appendChild(title);

    const gallery = document.createElement('div');
    gallery.className = 'h-scroll';

    const types = [
      { id: 'sand',   label: 'Sand'   },
      { id: 'dirt',   label: 'Dirt'   },
      { id: 'grass',  label: 'Grass'  },
      { id: 'stone',  label: 'Stone'  },
      { id: 'gravel', label: 'Gravel' },
      { id: 'water',  label: 'Water'  },
    ];

    this.terrainTiles = [];

    types.forEach(t => {
      const card = document.createElement('button');
      card.className = 'tile';
      card.type = 'button';
      card.dataset.terrainId = t.id;

      const canvas = generateTerrainThumbnail(t.id, 96);
      canvas.className = 'thumb';

      const label = document.createElement('label');
      label.textContent = t.label;

      card.append(canvas, label);
      if (t.id === this.terrainSelected) card.classList.add('selected');

      gallery.appendChild(card);
      this.terrainTiles.push(card);
    });

    wrap.appendChild(gallery);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Select a material to use for painting tiles (paint tools coming next).';
    wrap.appendChild(hint);

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
    hint.textContent = 'Saves include grid size, character tile, camera view, settings, and markers.';

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
      } else if (tabName === 'Terrain') {
        this.contentElement.appendChild(this._createTerrainTabContent());
      } else if (tabName === 'Settings') {
        this.contentElement.appendChild(this._createSettingsTabContent());
      } else {
        this.contentElement.textContent = `Content for the ${tabName} tab will appear here.`;
      }
    });

    // Delegated clicks inside current tab
    this.contentElement.addEventListener('click', (e) => {
      // Generate (Grid)
      const genBtn = e.target.closest('.generate-btn');
      if (genBtn) {
        const width = Math.max(2, Math.min(200, parseInt(this.widthInput.value, 10) || 30));
        const height = Math.max(2, Math.min(200, parseInt(this.heightInput.value, 10) || 30));
        const evt = new CustomEvent('generate', { detail: { width, height } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Save (Settings)
      const saveBtn = e.target.closest('.save-btn');
      if (saveBtn) {
        let filename = window.prompt('Name your save file:', 'titanmap.json');
        if (!filename) return;
        if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
        const evt = new CustomEvent('save-project', { detail: { filename } });
        this.panelElement.dispatchEvent(evt);
        return;
      }

      // Load (Settings)
      const loadBtn = e.target.closest('.load-btn');
      if (loadBtn) {
        this.fileInput.value = '';
        this.fileInput.click();
        return;
      }

      // Terrain selection
      const tile = e.target.closest('.tile');
      if (tile && tile.dataset.terrainId) {
        this.terrainSelected = tile.dataset.terrainId;
        this.terrainTiles?.forEach(t => t.classList.toggle('selected', t === tile));
        const evt = new CustomEvent('terrain-select', { detail: { type: this.terrainSelected } });
        this.panelElement.dispatchEvent(evt);
        return;
      }
    });

    // Marker toggle → request change
    this.panelElement.addEventListener('change', (e) => {
      const chk = e.target.closest('.marker-toggle');
      if (!chk) return;
      const wantOn = !!chk.checked;
      const evt = new CustomEvent('marker-toggle-request', { detail: { wantOn } });
      this.panelElement.dispatchEvent(evt);
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
      .muted { color: #8a8d92; font-weight: 400; font-size: 12px; }

      .generate-btn,
      .save-btn,
      .load-btn {
        background: #00aaff; color: #fff; border: none; padding: 8px 16px;
        border-radius: 2px; font-weight: 600; cursor: pointer;
      }
      .load-btn { background: #6a5acd; }
      .hint { opacity: 0.7; font-size: 12px; margin-top: 8px; }

      /* Pretty switch */
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

      /* Terrain gallery */
      .terrain-wrap {}
      .terrain-title { font-weight: 600; color: #dfe3e7; margin-bottom: 10px; }
      .h-scroll {
        display: flex; gap: 12px; overflow-x: auto; padding: 4px 2px;
        -webkit-overflow-scrolling: touch; scrollbar-width: thin;
      }
      .tile {
        flex: 0 0 auto; width: 96px; aspect-ratio: 1 / 1; padding: 0; border: 2px solid transparent;
        border-radius: 10px; background: #15181c; cursor: pointer; display: flex; flex-direction: column;
        align-items: stretch; justify-content: flex-start; outline: none;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
      }
      .tile.selected { border-color: #00aaff; box-shadow: 0 0 0 2px rgba(0,170,255,0.15) inset, 0 2px 10px rgba(0,0,0,0.35); }
      .tile .thumb { width: 100%; height: auto; display: block; border-top-left-radius: 8px; border-top-right-radius: 8px; }
      .tile label { text-align: center; font-size: 12px; padding: 6px 0 8px; color: #cfd3d7; }
    `;
    document.head.appendChild(style);
  }
}