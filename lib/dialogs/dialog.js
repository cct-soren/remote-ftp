'use babel';

import path from 'path';

const atom = global.atom;

export default class Dialog {

  constructor(opts) {
    const options = opts || {};

    this.prompt = options.prompt || '';
    this.initialPath = options.initialPath || '';
    this.select = options.select || false;
    this.iconClass = options.iconClass || '';

    // Root element
    this.element = document.createElement('div');
    this.element.classList.add('tree-view-dialog', 'overlay', 'from-top');

    // Label
    this.text = document.createElement('label');
    this.text.classList.add('icon');
    this.text.textContent = this.prompt;
    if (this.iconClass) this.text.classList.add(this.iconClass);
    this.element.appendChild(this.text);

    // Mini text editor
    this.miniEditor = document.createElement('atom-text-editor');
    this.miniEditor.setAttribute('mini', '');
    this.element.appendChild(this.miniEditor);

    // Error message
    this.error = document.createElement('div');
    this.error.classList.add('error-message');
    this.element.appendChild(this.error);

    const self = this;

    atom.commands.add(this.element, {
      'core:confirm': () => {
        self.onConfirm(self.miniEditor.getModel().getText());
      },
      'core:cancel': () => {
        self.cancel();
      },
    });

    this.miniEditor.addEventListener('blur', () => {
      this.close();
    });

    this.miniEditor.getModel().onDidChange(() => {
      this.showError();
    });

    if (this.initialPath) {
      this.miniEditor.getModel().setText(this.initialPath);
    }

    if (this.select) {
      const ext = path.extname(this.initialPath);
      const name = path.basename(this.initialPath);
      let selEnd;

      if (name === ext) {
        selEnd = this.initialPath.length;
      } else {
        selEnd = this.initialPath.length - ext.length;
      }

      const range = [
        [0, this.initialPath.length - name.length],
        [0, selEnd],
      ];

      this.miniEditor.getModel().setSelectedBufferRange(range);
    }
  }

  attach() {
    this.panel = atom.workspace.addModalPanel({ item: this.element });
    this.miniEditor.focus();
    this.miniEditor.getModel().scrollToCursorPosition();
  }

  close() {
    const destroyPanel = this.panel;
    this.panel = null;
    if (destroyPanel) destroyPanel.destroy();
    atom.workspace.getActivePane().activate();
  }

  cancel() {
    this.close();
    const ftpView = document.querySelector('.ftp-view');
    if (ftpView) ftpView.focus();
  }

  showError(message) {
    this.error.textContent = message || '';
    if (message) this.flashError();
  }

  // Called by subclasses that need to handle confirm
  onConfirm() {}

  // Trigger a custom event on the element (for compatibility with .on() listeners)
  trigger(eventName, args) {
    const argsArray = Array.isArray(args) ? args : [args];
    const event = new CustomEvent(eventName, { detail: argsArray, bubbles: true });
    this.element.dispatchEvent(event);
  }

  // Subscribe to events (replaces SpacePen/jQuery .on())
  on(eventName, callback) {
    this.element.addEventListener(eventName, (e) => {
      callback(e, ...(e.detail || []));
    });
  }
}
