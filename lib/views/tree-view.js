'use babel';

import { CompositeDisposable } from 'event-kit';
import {
  elapsedTime,
  resolveTree,
  getSelectedTree,
} from '../helpers';
import DirectoryView from './directory-view';

// Returns true if el is visible in the DOM (not hidden by collapsed ancestors)
function isVisible(el) {
  return el != null && el.offsetParent !== null;
}

// Previous sibling matching selector that is also visible
function prevVisibleEntry(el) {
  let s = el.previousElementSibling;
  while (s) {
    if (s.matches('.entry') && isVisible(s)) return s;
    s = s.previousElementSibling;
  }
  return null;
}

// Next sibling matching selector that is also visible
function nextVisibleEntry(el) {
  let s = el.nextElementSibling;
  while (s) {
    if (s.matches('.entry') && isVisible(s)) return s;
    s = s.nextElementSibling;
  }
  return null;
}

// Last visible .entry descendant inside container
function lastVisibleDescendant(container) {
  const all = Array.from(container.querySelectorAll('.entries .entry')).filter(isVisible);
  return all[all.length - 1] || null;
}

class TreeView {
  constructor(storage) {
    this.subscriptions = new CompositeDisposable();
    this.lastSelected = [];
    this.storage = storage;

    // Supported for old API
    this.getSelected = getSelectedTree;
    this.resolve = resolveTree;

    // Root element
    this.element = document.createElement('div');
    this.element.classList.add('remote-ftp-view', 'tool-panel');

    // File tree list
    this.list = document.createElement('ol');
    this.list.classList.add('ftptree-view', 'full-menu', 'list-tree', 'has-collapsable-children', 'focusable-panel');
    this.list.tabIndex = -1;
    this.element.appendChild(this.list);

    // Queue panel (progress + debug)
    this.queue = document.createElement('div');
    this.queue.classList.add('queue', 'tool-panel', 'panel-bottom');
    this.queue.tabIndex = -1;
    this.element.appendChild(this.queue);

    this.progress = document.createElement('ul');
    this.progress.classList.add('progress', 'tool-panel', 'panel-top');
    this.progress.tabIndex = -1;
    this.queue.appendChild(this.progress);

    this.debug = document.createElement('ul');
    this.debug.classList.add('list');
    this.debug.tabIndex = -1;
    this.queue.appendChild(this.debug);

    this.info = document.createElement('span');
    this.info.classList.add('remote-ftp-info', 'icon', 'icon-unfold');
    this.info.tabIndex = -1;
    this.queue.appendChild(this.info);

    // Offline panel
    this.offline = document.createElement('div');
    this.offline.classList.add('offline');
    this.offline.tabIndex = -1;
    this.element.appendChild(this.offline);

    this.offline.innerHTML = `
    <div class="remote-ftp-offline-inner">
    <div class="remote-ftp-picto"><span class="icon icon-shield"></span></div>
    <ul>
      <li><a role="connect" class="btn btn-default icon">Connect</a><br /></li>
      <li><a role="configure" class="btn btn-default icon">Edit Configuration</a><br /></li>
      <li><a role="configure_ignored" class="btn btn-default icon">Edit Ignore Configuration</a><br /></li>
      <li><a role="toggle" class="btn btn-default icon">Close Panel</a></li>
    </ul>
    </div>`;

    this.initialize(storage);
  }

  initialize(storage) {
    if (storage) this.storage = storage;

    if (atom.project.remoteftp.isConnected()) {
      this.showOnline();
    } else {
      this.showOffline();
    }

    this.root = new DirectoryView(atom.project.remoteftp.root);
    this.root.expand();
    this.list.appendChild(this.root.element);

    // Config changes
    this.subscriptions.add(
      atom.config.onDidChange('remote-ftp.tree.enableDragAndDrop', (value) => {
        if (value.newValue) {
          this.createDragAndDrops();
        } else {
          this.disposeDragAndDrops();
        }
      }),
    );

    // Debug messages
    atom.project.remoteftp.onDidDebug((msg) => {
      this.debug.insertAdjacentHTML('afterbegin', `<li>${msg}</li>`);
      if (this.debug.children.length > 20) {
        this.debug.lastElementChild.remove();
      }
    });

    // Queue / progress rendering
    atom.project.remoteftp.onDidQueueChanged(() => {
      this.progress.innerHTML = '';

      const queues = [];
      if (atom.project.remoteftp.current) {
        queues.push(atom.project.remoteftp.current);
      }
      atom.project.remoteftp.queue.forEach(queueElem => queues.push(queueElem));

      if (queues.length === 0) {
        this.progress.style.display = 'none';
        this.queue.style.height = '';
        this.list.style.paddingBottom = '';
      } else {
        this.progress.style.display = 'block';
        // Size queue to fit items (27px info bar + 26px per item), capped at 300px
        const itemHeight = 26;
        const infoBarHeight = 27;
        const naturalHeight = Math.min(infoBarHeight + queues.length * itemHeight, 300);
        this.queue.style.height = `${naturalHeight}px`;
        // Keep the last file list items visible above the sticky queue
        this.list.style.paddingBottom = `${naturalHeight}px`;

        queues.forEach((queue) => {
          const li = document.createElement('li');
          li.innerHTML = `<progress class="inline-block"></progress><div class="name">${queue[0]}</div><div class="eta">-</div>`;
          const progressEl = li.querySelector('progress');
          const etaEl = li.querySelector('.eta');
          const prog = queue[2];

          this.progress.appendChild(li);

          prog.on('progress', (percent) => {
            if (percent === -1) {
              progressEl.removeAttribute('max');
              progressEl.removeAttribute('value');
              etaEl.textContent = '-';
            } else {
              progressEl.setAttribute('max', 100);
              progressEl.setAttribute('value', parseInt(percent * 100, 10));
              etaEl.textContent = elapsedTime(prog.getEta());
            }
          });

          prog.once('done', () => {
            prog.removeAllListeners('progress');
          });
        });
      }
    });

    // Offline panel button events (delegated)
    this.offline.addEventListener('click', (e) => {
      if (e.target.closest('[role="connect"]')) {
        atom.project.remoteftp.readConfig(() => {
          atom.project.remoteftp.connect();
        });
      } else if (e.target.closest('[role="configure"]')) {
        atom.workspace.open(atom.project.remoteftp.getConfigPath());
      } else if (e.target.closest('[role="configure_ignored"]')) {
        atom.workspace.open(atom.project.getDirectories()[0].resolve('.ftpignore'));
      } else if (e.target.closest('[role="toggle"]')) {
        this.toggle();
      }
    });

    this.info.addEventListener('click', (e) => { this.toggleInfo(e); });

    this.list.addEventListener('keydown', (e) => { this.remoteKeyboardNavigation(e); });

    // Click handler for tree entries (delegated from root entries list)
    this.root.entries.addEventListener('click', (e) => {
      const entry = e.target.closest('li.entry');
      if (!entry) return;

      e.stopPropagation();
      e.preventDefault();

      let elem = e.target;

      if (!elem.classList.contains('entry') || !elem.classList.contains('list-item')) {
        if (!elem.classList.contains('name') && !elem.classList.contains('header')) {
          return;
        }
        elem = elem.parentElement;
      }

      this.remoteMultiSelect(e, elem);
    });

    atom.project.remoteftp.onDidConnected(() => {
      this.showOnline();
    });

    atom.project.remoteftp.onDidDisconnected(() => {
      this.showOffline();
    });

    this.getTitle = () => 'Remote';

    if (this.storage.data.options.treeViewShow) {
      this.attach();
    }
  }

  // Required by Pulsar's pane item protocol
  getElement() {
    return this.element;
  }

  getTitle() {
    return 'Remote';
  }

  show() {
    this.element.style.display = '';
  }

  hide() {
    this.element.style.display = 'none';
  }

  serialize() {
    return this.storage.data;
  }

  toggleInfo() {
    this.queue.classList.toggle('active');

    if (this.queue.classList.contains('active')) {
      this.info.classList.remove('icon-unfold');
      this.info.classList.add('icon-fold');
    } else {
      this.info.classList.remove('icon-fold');
      this.info.classList.add('icon-unfold');
    }
  }

  getDockElems() {
    const currentSide = this.storage.data.options.treeViewSide.toLowerCase();
    const currentDock = atom.workspace.paneContainers[currentSide];

    if (typeof currentDock !== 'object') return false;

    const activePane = currentDock.getPanes()[0];

    return {
      currentSide,
      currentDock,
      activePane,
    };
  }

  onDidCloseItem() {
    this.detach();
  }

  attach() {
    const dockElems = this.getDockElems();

    if (!dockElems.activePane) return;

    this.panel = dockElems.activePane.addItem(this);
    this.storage.data.options.treeViewShow = true;

    if (!dockElems.currentDock.isVisible() && this.storage.data.options.treeViewShow) {
      dockElems.currentDock.toggle();
    }

    atom.workspace.onDidDestroyPaneItem(({ item }) => {
      if (item === this.panel) {
        this.onDidCloseItem(this.panel);
      }
    });
  }

  detach() {
    this.element.remove();

    if (this.panel) {
      if (typeof this.panel.destroy === 'function') {
        this.panel.destroy();
      } else if (typeof atom.workspace.paneForItem === 'function') {
        const pane = atom.workspace.paneForItem(this.panel);
        if (pane) pane.destroyItem(this.panel, true);
      }
      this.panel = null;
    }

    this.storage.data.options.treeViewShow = false;
  }

  dispose() {
    this.subscriptions.dispose();
  }

  createDragAndDrops() {
    this.root.getViews().forEach((view) => {
      if (typeof view.dragEventsDestroy === 'function') {
        view.dragEventsActivate();
      }
    });
  }

  disposeDragAndDrops() {
    this.root.getViews().forEach((view) => {
      if (typeof view.dragEventsDestroy === 'function') {
        view.dragEventsDestroy();
      }
    });
  }

  toggle() {
    if (typeof this.panel !== 'undefined' && this.panel !== null) {
      this.detach();
    } else {
      this.attach();
    }
  }

  showOffline() {
    this.list.style.display = 'none';
    this.queue.style.display = 'none';
    this.offline.style.display = 'flex';
  }

  showOnline() {
    this.list.style.display = '';
    this.queue.style.display = '';
    this.offline.style.display = 'none';

    if (!atom.project.remoteftp.connector.ftp) {
      this.info.style.display = 'none';
    }
  }

  remoteMultiSelect(e, current) {
    const treeView = atom.project.remoteftpMain.treeView;
    const lastSelectedView = treeView.lastSelected[treeView.lastSelected.length - 1];
    const lastSelected = lastSelectedView ? lastSelectedView.element : null;

    const keyCode = e.keyCode || e.which;
    if (keyCode !== 1 || !e.shiftKey) {
      this.list.classList.remove('multi-select');
      return true;
    }

    if (lastSelected === current) return true;

    const entries = Array.from(this.list.querySelectorAll('li.entry:not(.project-root)'));

    this.list.classList.add('multi-select');

    const lastIndex = entries.indexOf(lastSelected);
    const currIndex = entries.indexOf(current);

    if (lastIndex === -1 || currIndex === -1) return true;

    const entryMin = Math.min(lastIndex, currIndex);
    const entryMax = Math.max(lastIndex, currIndex);

    for (let i = entryMin; i <= entryMax; i++) {
      entries[i].classList.add('selected');
    }

    return true;
  }

  remoteKeyboardNavigation(e) {
    const arrows = { left: 37, up: 38, right: 39, down: 40 };
    const keyCode = e.keyCode || e.which;

    if (Object.values(arrows).indexOf(keyCode) > -1 && e.shiftKey) {
      this.list.classList.add('multi-select');
    } else {
      this.list.classList.remove('multi-select');
    }

    switch (keyCode) {
      case arrows.up:
        this.remoteKeyboardNavigationUp();
        break;
      case arrows.down:
        this.remoteKeyboardNavigationDown();
        break;
      case arrows.left:
        this.remoteKeyboardNavigationLeft();
        break;
      case arrows.right:
        this.remoteKeyboardNavigationRight();
        break;
      default:
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.remoteKeyboardNavigationMovePage();
  }

  remoteKeyboardNavigationUp() {
    const current = this.list.querySelector('.selected');
    if (!current) return;

    const isMulti = this.list.classList.contains('multi-select');
    let next = prevVisibleEntry(current);

    if (next) {
      while (next.classList.contains('expanded')) {
        const last = lastVisibleDescendant(next);
        if (!last) break;
        next = last;
      }
    } else {
      const parent = current.closest('.entries');
      next = parent ? parent.closest('.entry') : null;
      if (next && !isVisible(next)) next = null;
    }

    if (next) {
      if (!isMulti) current.classList.remove('selected');
      next.classList.add('selected');
    }
  }

  remoteKeyboardNavigationDown() {
    const current = this.list.querySelector('.selected');
    if (!current) return;

    const isMulti = this.list.classList.contains('multi-select');
    let next = null;

    // Try first visible child entry
    const childEntry = current.querySelector('.entries .entry');
    if (childEntry && isVisible(childEntry)) {
      next = childEntry;
    }

    if (!next) {
      let tmp = current;
      do {
        next = nextVisibleEntry(tmp);
        if (!next) {
          const parentEntries = tmp.closest('.entries');
          tmp = parentEntries ? parentEntries.closest('.entry') : null;
        }
      } while (!next && tmp && !tmp.classList.contains('project-root'));
    }

    if (next) {
      if (!isMulti) current.classList.remove('selected');
      next.classList.add('selected');
    }
  }

  remoteKeyboardNavigationLeft() {
    const current = this.list.querySelector('.selected');
    if (!current) return;

    if (!current.classList.contains('directory')) {
      const parent = current.closest('.directory');
      if (parent) {
        const view = parent._ftpView;
        if (view) view.collapse();
        current.classList.remove('selected');
        parent.classList.add('selected');
      }
    } else {
      const view = current._ftpView;
      if (view) view.collapse();
    }
  }

  remoteKeyboardNavigationRight() {
    const current = this.list.querySelector('.selected');
    if (!current) return;

    if (current.classList.contains('directory')) {
      const view = current._ftpView;
      if (view) {
        view.open();
        view.expand();
      }
    }
  }

  remoteKeyboardNavigationMovePage() {
    const current = this.list.querySelector('.selected');
    if (!current) return;

    const scrollerTop = this.element.scrollTop;
    const selectedTop = current.getBoundingClientRect().top - this.element.getBoundingClientRect().top;

    if (selectedTop < scrollerTop - 10) {
      this.element.scrollTop -= this.element.offsetHeight;
    } else if (selectedTop > scrollerTop + (this.element.offsetHeight - 10)) {
      this.element.scrollTop += this.element.offsetHeight;
    }
  }
}

export default TreeView;
