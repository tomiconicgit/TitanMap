// file: ui-panel.js

export class UIPanel {
  constructor(container) {
    this.container = container;
    this.activeTab = null;

    this._createStyles();
    this._createPanel();
    this._addEventListeners();
  }

  _createPanel() {
    this.panelElement = document.createElement('div');
    this.panelElement.className = 'ui-panel';

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';

    const tabNames = ['Grid', 'Objects', 'Terrain', 'Lighting', 'Effects', 'Settings'];
    tabNames.forEach((name, index) => {
      const tabButton = document.createElement('button');
      tabButton.className = 'tab';
      tabButton.textContent = name;
      tabButton.dataset.tabName = name; // Store tab name
      if (index === 0) {
        tabButton.classList.add('active');
        this.activeTab = tabButton;
      }
      tabsContainer.appendChild(tabButton);
    });

    this.contentElement = document.createElement('div');
    this.contentElement.className = 'panel-content';
    this.contentElement.textContent = 'Content for the Grid tab will appear here.';

    this.panelElement.appendChild(tabsContainer);
    this.panelElement.appendChild(this.contentElement);
    this.container.appendChild(this.panelElement);
  }

  _addEventListeners() {
    this.panelElement.querySelector('.tabs-container').addEventListener('click', (event) => {
      const clickedTab = event.target.closest('.tab');
      if (!clickedTab || clickedTab === this.activeTab) return;

      // Update active state
      this.activeTab.classList.remove('active');
      clickedTab.classList.add('active');
      this.activeTab = clickedTab;

      // Update content
      this.contentElement.textContent = `Content for the ${clickedTab.dataset.tabName} tab will appear here.`;
    });
  }

  _createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --safe-bottom: env(safe-area-inset-bottom, 15px);
      }
      .ui-panel {
        position: fixed;
        left: 50%;
        bottom: 15px;
        transform: translateX(-50%);
        width: calc(100% - 30px);
        max-width: 700px;
        z-index: 10;
        background-color: rgba(30, 32, 37, 0.8);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        color: #e8e8ea;
        padding-bottom: var(--safe-bottom);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .tabs-container {
        display: flex;
        flex-wrap: wrap;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .tab {
        background: none;
        border: none;
        padding: 12px 16px;
        color: #aaa;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: color 0.2s ease;
        border-bottom: 2px solid transparent;
      }
      .tab:hover {
        color: #fff;
      }
      .tab.active {
        color: #fff;
        border-bottom-color: #00aaff;
      }
      .panel-content {
        padding: 16px;
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }
}
