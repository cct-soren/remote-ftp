'use babel';

import { CompositeDisposable } from 'atom';
import { getIconHandler } from '../helpers';

class FileView {
  constructor(file) {
    this.subscriptions = new CompositeDisposable();
    this.item = file;

    this.element = document.createElement('li');
    this.element.classList.add('file', 'entry', 'list-item');
    this.element.setAttribute('is', 'tree-view-file');

    this.name = document.createElement('span');
    this.name.classList.add('name', 'icon');
    this.element.appendChild(this.name);

    // Store reference so getViewFromElement() can find this view
    this.element._ftpView = this;

    this.name.textContent = this.item.name;
    this.name.setAttribute('data-name', this.item.name);
    this.name.setAttribute('data-path', this.item.remote);

    if (atom.project.remoteftp.checkIgnore(this.item.remote)) {
      this.element.classList.add('status-ignored');
    }

    const addIconToElement = getIconHandler();

    if (addIconToElement) {
      const iconPath = this.item && this.item.local;
      this.iconDisposable = addIconToElement(this.name, iconPath);
    } else {
      switch (this.item.type) {
        case 'binary':
          this.name.classList.add('icon-file-binary');
          break;
        case 'compressed':
          this.name.classList.add('icon-file-zip');
          break;
        case 'image':
          this.name.classList.add('icon-file-media');
          break;
        case 'pdf':
          this.name.classList.add('icon-file-pdf');
          break;
        case 'readme':
          this.name.classList.add('icon-book');
          break;
        case 'text':
          this.name.classList.add('icon-file-text');
          break;
        default:
          break;
      }
    }

    this.triggers();
    this.events();
  }

  triggers() {
    this.item.onChangeSelect(() => {
      let lastSelected = atom.project.remoteftpMain.treeView.lastSelected;

      if (this.item.isSelected) {
        lastSelected.push(this);
        lastSelected = lastSelected.reverse().slice(0, 2).reverse();
      }
    });
  }

  events() {
    this.element.addEventListener('mousedown', (e) => {
      e.stopPropagation();

      const view = this;
      const button = e.button !== undefined ? e.button : 0;
      const selectKey = process.platform === 'darwin' ? 'metaKey' : 'ctrlKey';
      const selected = document.querySelectorAll('.remote-ftp-view .selected');

      if (!view) return;

      if ((button === 0 || button === 2) && !(button === 2 && selected.length > 1)) {
        if (!e[selectKey]) {
          selected.forEach(el => el.classList.remove('selected'));
          document.querySelectorAll('.remote-ftp-view .entries.list-tree').forEach(el => el.classList.remove('multi-select'));
        } else {
          document.querySelectorAll('.remote-ftp-view .entries.list-tree').forEach(el => el.classList.add('multi-select'));
        }
        this.element.classList.toggle('selected');
        this.item.setIsSelected = this.element.classList.contains('selected');
      }
    });

    this.element.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.open();
    });

    if (atom.config.get('remote-ftp.tree.enableDragAndDrop')) {
      this.setDraggable(true);
    }

    this.subscriptions.add(
      atom.config.onDidChange('remote-ftp.tree.enableDragAndDrop', (values) => {
        this.setDraggable(values.newValue);
      }),
    );
  }

  setDraggable(bool) {
    this.element.setAttribute('draggable', bool);
  }

  dispose() {
    this.subscriptions.dispose();
  }

  destroy() {
    this.item = null;

    if (this.iconDisposable) {
      this.iconDisposable.dispose();
      this.iconDisposable = null;
    }

    this.element.remove();
  }

  open() {
    this.item.open();
  }
}

export default FileView;
