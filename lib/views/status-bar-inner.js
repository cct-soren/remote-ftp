'use babel';

import { CompositeDisposable, Emitter } from 'atom';

export default class StatusBarViewInner {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.emitter = new Emitter();

    this.element = document.createElement('div');
    this.element.classList.add('ftp-statusbar-view-inner');

    const header = document.createElement('div');
    header.classList.add('StatusBarHeader');

    const titleWrap = document.createElement('div');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'Remote';
    titleWrap.appendChild(titleSpan);

    this.settings = document.createElement('span');
    this.settings.classList.add('icon-gear');

    header.appendChild(titleWrap);
    header.appendChild(this.settings);

    const inner = document.createElement('div');
    inner.classList.add('StatusBarInner');

    const tight = document.createElement('div');
    tight.classList.add('inline-block-tight');

    const label = document.createElement('label');
    label.classList.add('input-label');

    this.autoSave = document.createElement('input');
    this.autoSave.classList.add('input-toggle');
    this.autoSave.type = 'checkbox';

    label.appendChild(this.autoSave);
    label.appendChild(document.createTextNode(' Auto-save'));
    tight.appendChild(label);
    inner.appendChild(tight);

    this.element.appendChild(header);
    this.element.appendChild(inner);

    this.didAttach();
  }

  didAttach() {
    const remoteftpMain = atom.project.remoteftpMain;
    if (remoteftpMain && remoteftpMain.storage) {
      this.autoSave.checked = remoteftpMain.storage.data.options.autosave;
    }
    this.events();
  }

  getElement() {
    return this.element;
  }

  dispose() {
    this.subscriptions.dispose();
    this.element.remove();
  }

  events() {
    this.autoSave.addEventListener('click', (e) => {
      this.emitter.emit('change-auto-save', this.autoSave.checked, e);
    });

    this.settings.addEventListener('click', () => {
      this.emitter.emit('open-settings');
    });
  }

  onDidChangeAutoSave(callback) {
    this.subscriptions.add(
      this.emitter.on('change-auto-save', callback),
    );
  }

  onDidOpenSettings(callback) {
    this.subscriptions.add(
      this.emitter.on('open-settings', callback),
    );
  }
}
