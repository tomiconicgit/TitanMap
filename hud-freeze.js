// file: hud-freeze.js
export class FreezeHUD {
  constructor() {
    this.el = null;
    this.checkbox = null;
    this._onChange = () => {};
    this._build();
  }

  _build() {
    const style = document.createElement('style');
    style.textContent = `
      .hud-freeze {
        position: fixed; top: 12px; left: 12px; z-index: 20;
        display: flex; align-items: center; gap: 8px;
        background: rgba(30,32,37,0.85); color: #e8e8ea;
        padding: 8px 10px; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        font: 600 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,sans-serif;
      }
      .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; cursor: pointer; inset: 0;
        background: #3a3d46; transition: .2s; border-radius: 999px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
      }
      .slider:before {
        position: absolute; content: ""; height: 18px; width: 18px; left: 3px; top: 3px;
        background: #fff; border-radius: 50%; transition: .2s;
      }
      input:checked + .slider { background: #00aaff; }
      input:checked + .slider:before { transform: translateX(20px); }
      input:disabled + .slider { filter: grayscale(0.3); opacity: 0.6; cursor: not-allowed; }
    `;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'hud-freeze';
    this.el.innerHTML = `
      <label class="switch" title="Freeze tap-to-move">
        <input type="checkbox" id="freezeMoveToggle">
        <span class="slider"></span>
      </label>
      <span>Freeze tap-to-move</span>
    `;
    document.body.appendChild(this.el);

    this.checkbox = this.el.querySelector('#freezeMoveToggle');
    this.checkbox.addEventListener('change', () => {
      this._onChange(!!this.checkbox.checked);
    });
  }

  onChange(cb) { this._onChange = cb || (()=>{}); }
  set(value) { this.checkbox.checked = !!value; }
  setDisabled(disabled) { this.checkbox.disabled = !!disabled; }
}