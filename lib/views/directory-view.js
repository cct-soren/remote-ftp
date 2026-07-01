'use babel';

import { Emitter, CompositeDisposable } from 'atom';
import path from 'path';
import { getIconHandler, checkTarget } from '../helpers';
import FileView from './file-view';

class DirectoryView {
  constructor(directory) {
    this.moveTarget = null;
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.subsDrags = new CompositeDisposable();

    // Root element
    this.element = document.createElement('li');
    this.element.classList.add('directory', 'entry', 'list-nested-item', 'collapsed');
    this.element.setAttribute('is', 'tree-view-directory');
    this.element.setAttribute('draggable', 'true');

    // Store reference for getViewFromElement() lookup
    this.element._ftpView = this;

    // Header
    this.header = document.createElement('div');
    this.header.classList.add('header', 'list-item');
    this.header.setAttribute('is', 'tree-view-directory');

    this.name = document.createElement('span');
    this.name.classList.add('name', 'icon');
    this.header.appendChild(this.name);
    this.element.appendChild(this.header);

    // Entries list
    this.entries = document.createElement('ol');
    this.entries.classList.add('entries', 'list-tree');
    this.element.appendChild(this.entries);

    this.item = directory;
    this.name.textContent = this.item.name;
    this.name.setAttribute('data-name', this.item.name);
    this.name.setAttribute('data-path', this.item.remote);

    if (atom.project.remoteftp.checkIgnore(this.item.remote)) {
      this.element.classList.add('status-ignored');
    }

    const addIconToElement = getIconHandler();
    if (addIconToElement) {
      const iconPath = this.item && this.item.local;
      if (typeof iconPath !== 'undefined') {
        this.iconDisposable = addIconToElement(this.name, iconPath, { isDirectory: true });
      }
    } else {
      this.name.classList.add(this.item.type && this.item.type === 'l' ? 'icon-file-symlink-directory' : 'icon-file-directory');
    }

    if (this.item.isExpanded || this.item.isRoot) { this.expand(); }

    if (this.item.isRoot) {
      this.element.classList.add('project-root');
      this.header.classList.add('project-root-header');
      this.name.classList.remove('icon-file-directory');
      this.name.classList.add('icon-server');
    }

    this.triggers();
    this.repaint();
    this.events();

    if (atom.config.get('remote-ftp.tree.enableDragAndDrop')) {
      this.dragEventsActivate();
    }
  }

  triggers() {
    this.subscriptions.add(
      this.item.onChangeSelect(() => {
        let lastSelected = atom.project.remoteftpMain.treeView.lastSelected;

        if (this.item.isSelected) {
          lastSelected.push(this);
          lastSelected = lastSelected.reverse().slice(0, 2).reverse();
        }
      }),

      this.item.onChangeItems(() => {
        this.repaint();
      }),

      this.item.onChangeExpanded(() => {
        this.setClasses();
      }),

      this.item.onDestroyed(() => {
        this.destroy();
      }),
    );
  }

  onDidMouseDown(callback) {
    this.subscriptions.add(this.emitter.on('mousedown', e => callback(e)));
  }

  onDidDbClick(callback) {
    this.subscriptions.add(this.emitter.on('dblclick', e => callback(e)));
  }

  onDidChangeEnableDragAndDrop(callback) {
    this.subsDrags.add(this.emitter.on('enableDragAndDrop', () => callback()));
  }

  onDidDrop(callback) {
    this.subsDrags.add(this.emitter.on('drop', e => callback(e)));
  }

  onDidDragStart(callback) {
    this.subsDrags.add(this.emitter.on('dragstart', e => callback(e)));
  }

  onDidDragOver(callback) {
    this.subsDrags.add(this.emitter.on('dragover', e => callback(e)));
  }

  onDidDragEnter(callback) {
    this.subsDrags.add(this.emitter.on('dragenter', e => callback(e)));
  }

  onDidDragLeave(callback) {
    this.subsDrags.add(this.emitter.on('dragleave', e => callback(e)));
  }

  events() {
    this.element.addEventListener('dblclick', e => this.emitter.emit('dblclick', e));
    this.element.addEventListener('mousedown', e => this.emitter.emit('mousedown', e));

    this.onDidMouseDown((e) => {
      const self = e.currentTarget;
      e.stopPropagation();

      const view = self._ftpView;
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

        if (e.shiftKey) return;

        if (button === 0 && !e[selectKey]) {
          if (view.item.status === 0) {
            view.open();
            view.toggle();
          }
          view.toggle();
        }
      }
    });

    this.onDidDbClick((e) => {
      const self = e.currentTarget;
      e.stopPropagation();

      const view = self._ftpView;
      if (!view) return;
      view.open();
    });
  }

  static actionRemoteMove(e, dataTransfer) {
    const ftp = atom.project.remoteftpMain;
    const pathInfos = JSON.parse(dataTransfer.getData('pathInfos'));
    const newPathInfo = DirectoryView.queryDataPath(e.currentTarget);
    const destPath = path.posix.join(newPathInfo, pathInfos.name);

    if (pathInfos.fullPath === '/' || pathInfos.fullPath === destPath) return;

    ftp.client.rename(pathInfos.fullPath, destPath, (err) => {
      if (err) console.error(err);
    });
  }

  static actionToRemote(e, dataTransfer) {
    const newPathInfo = DirectoryView.queryDataPath(e.currentTarget);
    const localPaths = JSON.parse(dataTransfer.getData('localPaths'));
    const destPath = path.posix.join(newPathInfo, localPaths.name);

    atom.project.remoteftpMain.client.uploadTo(localPaths.fullPath, destPath, (err) => {
      if (err) console.error(err);
    });
  }

  static queryDataPath(target) {
    return target.querySelector('span[data-path]').getAttribute('data-path');
  }

  dragEventsActivate() {
    this.element.addEventListener('drop', e => this.emitter.emit('drop', e));
    this.element.addEventListener('dragstart', e => this.emitter.emit('dragstart', e));
    this.element.addEventListener('dragover', e => this.emitter.emit('dragover', e));
    this.element.addEventListener('dragenter', e => this.emitter.emit('dragenter', e));
    this.element.addEventListener('dragleave', e => this.emitter.emit('dragleave', e));

    this.onDidDrop((e) => {
      e.preventDefault();
      e.stopPropagation();

      e.currentTarget.classList.remove('selected');

      if (!checkTarget(e)) return;
      if (this.moveTarget === e.currentTarget) return;

      const dataTransfer = e.dataTransfer;

      if (dataTransfer.getData('pathInfos').length !== 0) {
        DirectoryView.actionRemoteMove(e, dataTransfer);
      } else if (dataTransfer.getData('localPaths').length !== 0) {
        DirectoryView.actionToRemote(e, dataTransfer);
      }

      this.moveTarget = null;
    });

    this.onDidDragStart((e) => {
      this.moveTarget = e.currentTarget;

      const nameEl = e.target.querySelector('.name') || e.target;
      const dataTransfer = e.dataTransfer;
      const pathInfos = {
        fullPath: nameEl.getAttribute('data-path'),
        name: nameEl.getAttribute('data-name'),
      };

      dataTransfer.setData('pathInfos', JSON.stringify(pathInfos));
      dataTransfer.effectAllowed = 'move';
    });

    this.onDidDragOver((e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.onDidDragEnter((e) => {
      const self = e.currentTarget;
      e.stopPropagation();

      if (!checkTarget(e)) return;
      self.classList.add('selected');
    });

    this.onDidDragLeave((e) => {
      e.stopPropagation();
      e.currentTarget.classList.remove('selected');
    });
  }

  dragEventsDestroy() {
    this.subsDrags.dispose();
  }

  dispose() {
    this.subscriptions.dispose();
    this.subsDrags.dispose();
    this.emitter.dispose();
  }

  destroy() {
    this.item = null;

    if (this.iconDisposable) {
      this.iconDisposable.dispose();
      this.iconDisposable = null;
    }

    this.dispose();
    this.element.remove();
  }

  getViews() {
    return Array.from(this.entries.children).map(el => el._ftpView).filter(Boolean);
  }

  getItemViews(itemViews) {
    const views = this.getViews() || itemViews;
    const entries = {
      folders: [],
      files: [],
    };

    if (this.item) {
      this.item.folders.forEach((item) => {
        for (let a = 0, b = views.length; a < b; ++a) {
          if (views[a] && views[a] instanceof DirectoryView && views[a].item === item) {
            entries.folders.push(views[a]);
            return;
          }
        }
        entries.folders.push(new DirectoryView(item));
      });

      this.item.files.forEach((item) => {
        for (let a = 0, b = views.length; a < b; ++a) {
          if (views[a] && views[a] instanceof FileView && views[a].item === item) {
            entries.files.push(views[a]);
            return;
          }
        }
        entries.files.push(new FileView(item));
      });
    }

    return entries;
  }

  repaint() {
    while (this.entries.firstChild) {
      this.entries.removeChild(this.entries.firstChild);
    }

    const entries = this.getItemViews();

    let views = entries.folders.concat(entries.files);

    views.sort((a, b) => {
      if (a.constructor !== b.constructor) { return a instanceof DirectoryView ? -1 : 1; }
      if (a.item.name === b.item.name) { return 0; }

      return a.item.name.toLowerCase().localeCompare(b.item.name.toLowerCase());
    });

    views.forEach((view) => {
      this.entries.appendChild(view.element);
    });
  }

  setClasses() {
    if (this.item.isExpanded) {
      this.element.classList.add('expanded');
      this.element.classList.remove('collapsed');
    } else {
      this.element.classList.add('collapsed');
      this.element.classList.remove('expanded');
    }
  }

  expand(recursive) {
    this.item.setIsExpanded = true;

    if (recursive) {
      Array.from(this.entries.children).forEach((child) => {
        const view = child._ftpView;
        if (view && view instanceof DirectoryView) view.expand(true);
      });
    }
  }

  collapse(recursive) {
    this.item.setIsExpanded = false;

    if (recursive) {
      Array.from(this.entries.children).forEach((child) => {
        const view = child._ftpView;
        if (view && view instanceof DirectoryView) view.collapse(true);
      });
    }
  }

  toggle(recursive) {
    if (this.item.isExpanded) {
      this.collapse(recursive);
    } else {
      this.expand(recursive);
    }
  }

  open() {
    this.item.open();
  }

  refresh() {
    this.item.open();
  }
}

export default DirectoryView;
