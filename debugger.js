// file: debugger.js

class TitanDebugger {
  constructor() {
    /** @type {Array<object>} */
    this.errors = [];
    this.uiElements = {
      button: null,
      badge: null,
      modal: null,
      errorList: null,
    };

    // To prevent the debugger from logging its own errors in an infinite loop
    this.isLoggingError = false;

    // Wait for the DOM to be ready before creating the UI
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  /**
   * Initializes the debugger by setting up listeners and creating the UI.
   */
  init() {
    this._createUI();
    this._setupListeners();
    console.log('Titan Debugger Initialized. 🚀');
  }

  /**
   * Attaches global error listeners to catch all types of errors.
   */
  _setupListeners() {
    // Catch standard runtime errors
    window.onerror = (message, source, lineno, colno, error) => {
      const details = `Source: ${source}\nLine: ${lineno}, Column: ${colno}\nStack: ${error?.stack || 'Not available'}`;
      this._addError('Runtime Error', message, details);
      return true; // Prevents the default browser error handling
    };

    // Catch unhandled promise rejections (e.g., from async/await without try-catch)
    window.onunhandledrejection = (event) => {
      const message = event.reason?.message || 'No message provided.';
      const details = `Stack: ${event.reason?.stack || 'Not available'}`;
      this._addError('Promise Rejection', message, details);
      event.preventDefault(); // Prevents logging to console
    };

    // Intercept calls to console.error()
    const originalConsoleError = console.error;
    console.error = (...args) => {
      // Call the original console.error so the message still appears in the dev tools
      originalConsoleError.apply(console, args);
      
      const message = args.map(arg => {
        try {
          if (arg instanceof Error) return arg.message;
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }).join(' ');
      
      this._addError('Console Error', message, new Error().stack);
    };
  }
  
  /**
   * Adds an error to the internal log and updates the UI.
   * @param {string} type - The type of error (e.g., 'Runtime Error').
   * @param {string} message - The primary error message.
   * @param {string} details - The stack trace or other relevant details.
   */
  _addError(type, message, details) {
    if (this.isLoggingError) return;
    this.isLoggingError = true;
    try {
      this.errors.push({
        type,
        message,
        details,
        timestamp: new Date().toLocaleTimeString(),
      });
      this._updateUI();
    } catch (e) {
      console.log('FATAL: Error in the debugger itself:', e); // Fallback log
    } finally {
      this.isLoggingError = false;
    }
  }

  /**
   * Injects the debugger's HTML and CSS into the page.
   */
  _createUI() {
    // --- CSS ---
    const styles = `
      .titan-debugger-btn {
        position: fixed;
        top: 15px;
        right: 15px;
        z-index: 99998;
        background-color: #dc3545;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        font-size: 24px;
        font-family: monospace;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
      }
      .titan-debugger-btn:hover {
        transform: scale(1.1);
      }
      .titan-debugger-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        background-color: white;
        color: #dc3545;
        border: 2px solid #dc3545;
        border-radius: 50%;
        min-width: 24px;
        height: 24px;
        font-size: 14px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
      }
      .titan-debugger-modal {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background-color: rgba(0,0,0,0.6);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .titan-debugger-modal.hidden {
        display: none;
      }
      .titan-debugger-card {
        background-color: #212529;
        color: #e9ecef;
        border: 1px solid #495057;
        border-radius: 8px;
        width: 90%;
        max-width: 800px;
        height: 80vh;
        max-height: 700px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
      }
      .titan-debugger-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid #495057;
      }
      .titan-debugger-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-family: sans-serif;
      }
      .titan-debugger-header .actions {
        display: flex;
        gap: 10px;
      }
      .titan-debugger-header button {
        background-color: #495057;
        color: white;
        border: 1px solid #6c757d;
        border-radius: 5px;
        padding: 8px 12px;
        cursor: pointer;
        font-weight: 500;
        font-size: 14px;
      }
       .titan-debugger-header button:hover {
        background-color: #6c757d;
      }
      .titan-debugger-list {
        padding: 1rem;
        overflow-y: auto;
        flex-grow: 1;
        font-family: monospace;
        font-size: 14px;
      }
      .titan-debugger-error-item {
        border-bottom: 1px dashed #495057;
        padding-bottom: 1rem;
        margin-bottom: 1rem;
      }
      .titan-debugger-error-item:last-child {
        border-bottom: none;
      }
      .titan-debugger-error-item .msg {
        color: #ff8b8b;
        font-weight: bold;
        word-break: break-word;
      }
      .titan-debugger-error-item .meta {
        font-size: 12px;
        color: #adb5bd;
        margin: 4px 0;
      }
      .titan-debugger-error-item pre {
        background-color: #343a40;
        padding: 0.5rem;
        border-radius: 4px;
        white-space: pre-wrap;
        word-wrap: break-word;
        color: #ced4da;
      }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- HTML ---
    const html = `
      <button class="titan-debugger-btn" title="Show Errors">🐞<span class="titan-debugger-badge">0</span></button>
      <div class="titan-debugger-modal hidden">
        <div class="titan-debugger-card">
          <div class="titan-debugger-header">
            <h2>Error Log</h2>
            <div class="actions">
              <button class="titan-debugger-copy">Copy to Clipboard</button>
              <button class="titan-debugger-close">Close</button>
            </div>
          </div>
          <div class="titan-debugger-list">
            <p>No errors recorded yet. Good job!</p>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    // --- Store element references and attach listeners ---
    this.uiElements.button = document.querySelector('.titan-debugger-btn');
    this.uiElements.badge = document.querySelector('.titan-debugger-badge');
    this.uiElements.modal = document.querySelector('.titan-debugger-modal');
    this.uiElements.errorList = document.querySelector('.titan-debugger-list');

    this.uiElements.button.addEventListener('click', () => this._toggleModal(true));
    document.querySelector('.titan-debugger-close').addEventListener('click', () => this._toggleModal(false));
    document.querySelector('.titan-debugger-copy').addEventListener('click', () => this._copyToClipboard());
  }
  
  /**
   * Updates the UI elements (badge and error list) with the latest data.
   */
  _updateUI() {
    // Update badge
    const errorCount = this.errors.length;
    this.uiElements.badge.textContent = errorCount;
    this.uiElements.badge.style.display = errorCount > 0 ? 'flex' : 'none';

    // Update error list in modal if it's open
    if (!this.uiElements.modal.classList.contains('hidden')) {
      this._renderErrorList();
    }
  }

  /**
   * Generates and injects the HTML for the detailed error list.
   */
  _renderErrorList() {
    if (this.errors.length === 0) {
      this.uiElements.errorList.innerHTML = '<p>No errors recorded yet. Good job!</p>';
      return;
    }

    this.uiElements.errorList.innerHTML = this.errors.map((err, index) => `
      <div class="titan-debugger-error-item">
        <div class="msg">#${index + 1}: ${err.message}</div>
        <div class="meta">${err.type} at ${err.timestamp}</div>
        <pre>${err.details}</pre>
      </div>
    `).reverse().join(''); // Show most recent errors first
  }

  /**
   * Shows or hides the error modal.
   * @param {boolean} show - True to show, false to hide.
   */
  _toggleModal(show) {
    if (show) {
      this._renderErrorList();
      this.uiElements.modal.classList.remove('hidden');
    } else {
      this.uiElements.modal.classList.add('hidden');
    }
  }

  /**
   * Copies a formatted string of all errors to the user's clipboard.
   */
  _copyToClipboard() {
    const copyButton = document.querySelector('.titan-debugger-copy');
    if (this.errors.length === 0) {
      copyButton.textContent = 'Nothing to Copy!';
      setTimeout(() => { copyButton.textContent = 'Copy to Clipboard'; }, 2000);
      return;
    }
    
    const formattedErrors = this.errors.map((err, index) => `
--- ERROR #${index + 1} ---
Type: ${err.type}
Time: ${err.timestamp}
Message: ${err.message}
Details:
${err.details}
--------------------
`).join('\n');

    navigator.clipboard.writeText(formattedErrors).then(() => {
      copyButton.textContent = 'Copied!';
      setTimeout(() => { copyButton.textContent = 'Copy to Clipboard'; }, 2000);
    }).catch(err => {
      copyButton.textContent = 'Copy Failed!';
      console.error('Failed to copy errors to clipboard:', err);
      setTimeout(() => { copyButton.textContent = 'Copy to Clipboard'; }, 2000);
    });
  }
}

// Instantiate the debugger to start tracking
new TitanDebugger();
