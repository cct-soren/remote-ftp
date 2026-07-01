'use babel';

import { CompositeDisposable, Emitter } from 'atom';
import StatusBarViewInner from './status-bar-inner';

export default class StatusBarView {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.emitter = new Emitter();
    this.innerBar = new StatusBarViewInner();

    this.element = document.createElement('div');
    this.element.classList.add('ftp-statusbar-view', 'inline-block');

    this.ftpStatusBarView = document.createElement('span');
    this.ftpStatusBarView.classList.add('icon', 'icon-alignment-unalign');
    this.element.appendChild(this.ftpStatusBarView);

    this.opt = {
      iconList: {
        CONNECTED: 'icon-server',
        NOT_CONNECTED: 'icon-alignment-unalign',
      },
    };

    this.status = {
      name: null,
      isConnected: false,
    };

    this.ftp = atom.project.remoteftpMain;
    this.ftp.client.onDidChangeStatus((status) => {
      this.changeStatus(status);
    });

    this.setToolTip();
    this.setEvents();
  }

  getElement() {
    return this.element;
  }

  dispose() {
    this.subscriptions.dispose();
    this.element.remove();
  }

  setEvents() {
    this.element.addEventListener('click', () => {
      document.querySelectorAll('.tooltip[role="tooltip"]').forEach((el) => {
        el.classList.add('statusbar-view-tooltip', 'remote-ftp');
      });
    });

    this.onDidChangeStatus(() => {
      this.setIconHandler();
    });

    this.innerBar.onDidChangeAutoSave((newValue) => {
      this.ftp.storage.data.options.autosave = newValue;
    });

    this.innerBar.onDidOpenSettings(() => {
      atom.workspace.open('atom://config/packages/remote-ftp');
    });
  }

  setIconHandler() {
    if (this.status.isConnected) {
      this.ftpStatusBarView.classList.remove(this.opt.iconList.NOT_CONNECTED);
      this.ftpStatusBarView.classList.add(this.opt.iconList.CONNECTED);
    } else {
      this.ftpStatusBarView.classList.remove(this.opt.iconList.CONNECTED);
      this.ftpStatusBarView.classList.add(this.opt.iconList.NOT_CONNECTED);
    }
  }

  changeStatus(status) {
    this.status.isConnected = (status === 'CONNECTED');
    this.status.name = status;
    this.emitter.emit('change-status');
  }

  setToolTip() {
    this.subscriptions.add(
      atom.tooltips.add(this.element, {
        item: this.innerBar.getElement(),
        class: 'RemoteFtpPopoverTooltip',
        trigger: 'click',
        placement: 'top',
      }),
    );
  }

  onDidClickIcon(callback) {
    this.subscriptions.add(
      this.emitter.on('click-icon', callback),
    );
  }

  onDidChangeStatus(callback) {
    this.subscriptions.add(
      this.emitter.on('change-status', callback),
    );
  }
}
