// file: ui-panel.js

export class UIPanel {
  constructor(container) {
    this.container = container;
    this.activeTab = null;
    this.panelElement = document.createElement('div'); // The main element to dispatch events from

    this._createStyles();
    this._createPanel();
    this._addEventListeners();
  }

  // Creates the HTML for the "Grid" tab's content
  _createGridTabContent() {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-row';
    
    const label = document.createElement('label');
    label.textContent = 'Grid Size';
    
    this.widthInput = document.createElement('input');
    this.widthInput.type = 'number';
    this.widthInput.value = 10;
    this.widthInput.min = 2;
    this.widthInput.max = 100;
    
    const separator = document.createElement('span');
    separator.textContent = '×';

    this.heightInput = document.createElement('input');
    this.heightInput.type = 'number';
    this.heightInput.value = 10;
    this.heightInput.min = 2;
    this.heightInput.max = 100;

    this.generateButton = document.createElement('button');
    this.generateButton.textContent = 'Generate';
    this.generateButton.className = 'generate-btn';

    wrapper.append(label, this.widthInput, separator, this.heightInput, this.generateButton);
    return wrapper;
  }

  _createPanel() {
    this.panelElement.className = 'ui-panel';

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';

    // Updated to 5 tabs
    const tabNames = ['Grid', 'Objects', 'Terrain', 'Lighting', 'Settings'];
    tabNames.forEach((name, index) => {
      const tabButton = document.createElement('button');
      tabButton.className = 'tab';
      tabButton.textContent = name;
      tabButton.dataset.tabName = name;
      if (index === 0) {
        tabButton.classList.add('active');
        this.activeTab = tabButton;
      }
      tabsContainer.appendChild(tabButton);
    });

    this.contentElement = document.createElement('div');
    this.contentElement.className = 'panel-content';
    
    // Set the initial content to be the grid controls
    this.contentElement.appendChild(this._createGridTabContent());

    this.panelElement.appendChild(tabsContainer);
    this.panelElement.appendChild(this.contentElement);
    this.container.appendChild(this.panelElement);
  }

  _addEventListeners() {
    // Tab switching logic
    this.panelElement.querySelector('.tabs-container').addEventListener('click', (event) => {
      const clickedTab = event.target.closest('.tab');
      if (!clickedTab || clickedTab === this.activeTab) return;

      this.activeTab.classList.remove('active');
      clickedTab.classList.add('active');
      this.activeTab = clickedTab;

      // Update content based on which tab was clicked
      this.contentElement.innerHTML = ''; // Clear previous content
      const tabName = clickedTab.dataset.tabName;
      if (tabName === 'Grid') {
        this.contentElement.appendChild(this._createGridTabContent());
      } else {
        this.contentElement.textContent = `Content for the ${tabName} tab will appear here.`;
      }
    });

    // Generate button logic (attached to the content area via event delegation)
    this.contentElement.addEventListener('click', (event) => {
        if (event.target.className === 'generate-btn') {
            const width = parseInt(this.widthInput.value, 10);
            const height = parseInt(this.heightInput.value, 10);

            // Fire a custom event that main.js can listen for
            const generateEvent = new CustomEvent('generate', { 
                detail: { width, height } 
            });
            this.panelElement.dispatchEvent(generateEvent);
        }
    });
  }

  _createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --safe-bottom: env(safe-area-inset-bottom, 15px);
      }
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
      .tabs-container {
        display: flex; /* Kept flex for single-row layout */
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .tab {
        flex: 1; /* Make tabs distribute space evenly */
        text-align: center;
        background: none; border: none; padding: 12px 10px; color: #aaa;
        font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
        transition: color 0.2s ease; border-bottom: 2px solid transparent;
        white-space: nowrap;
      }
      .tab:hover { color: #fff; }
      .tab.active { color: #fff; border-bottom-color: #00aaff; }
      .panel-content { padding: 20px; font-size: 14px; min-height: 40px; }
      .panel-row { display: flex; align-items: center; gap: 10px; }
      .panel-row label { font-weight: 500; color: #ccc; }
      .panel-row input[type="number"] {
        width: 60px; background: #111; border: 1px solid #444; color: #fff;
        padding: 8px; border-radius: 2px; text-align: center;
      }
      .panel-row span { color: #777; font-weight: bold; }
      .generate-btn {
        margin-left: auto; /* Push the button to the far right */
        background: #00aaff; color: #fff; border: none; padding: 8px 16px;
        border-radius: 2px; font-weight: 600; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }
}
