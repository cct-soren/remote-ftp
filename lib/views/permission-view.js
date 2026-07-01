'use babel';

import { CompositeDisposable } from 'atom';
import { isNoChangeGroup, isNoChangeOwner, isNoChangeOwnerAndGroup, isPermissionDenied } from '../notifications';

function makeCheckbox(id, perm, labelText) {
  const label = document.createElement('label');
  label.classList.add('input-label', 'inline-block');
  label.textContent = labelText;

  const input = document.createElement('input');
  input.classList.add('input-checkbox');
  input.type = 'checkbox';
  input.id = id;
  input.setAttribute('data-perm', perm);

  label.insertBefore(input, label.firstChild);
  return label;
}

function makePermissionSection(className, title) {
  const div = document.createElement('div');
  div.classList.add(className, 'block');

  const h5 = document.createElement('h5');
  h5.textContent = title;
  div.appendChild(h5);

  div.appendChild(makeCheckbox(`${className}-read`, 'r', 'Read'));
  div.appendChild(makeCheckbox(`${className}-write`, 'w', 'Write'));
  div.appendChild(makeCheckbox(`${className}-execute`, 'x', 'Execute'));

  return div;
}

function makeMiniEditor() {
  const el = document.createElement('atom-text-editor');
  el.setAttribute('mini', '');
  return el;
}

class PermissionView {
  constructor(params, remotes) {
    this.ftp = atom.project.remoteftpMain;
    this.item = remotes.item;
    this.right = { r: 4, w: 2, x: 1 };

    this.disposables = new CompositeDisposable();

    // Build DOM
    this.element = document.createElement('div');
    this.element.classList.add('permission-view', 'remote-ftp');

    const wrapper = document.createElement('div');
    wrapper.classList.add('permissions-wrapper');

    this.permissionUser = makePermissionSection('permission-user', 'Owner Permissions');
    this.permissionGroup = makePermissionSection('permission-group', 'Group Permissions');
    this.permissionOther = makePermissionSection('permission-other', 'Public (other) Permissions');

    // Chown section
    const chownDiv = document.createElement('div');
    chownDiv.classList.add('permission-chown', 'block');

    const groupLabel = document.createElement('label');
    groupLabel.classList.add('input-label', 'inline-block');
    groupLabel.textContent = 'Group: ';
    chownDiv.appendChild(groupLabel);

    this.chownGroup = makeMiniEditor();
    chownDiv.appendChild(this.chownGroup);

    const ownerLabel = document.createElement('label');
    ownerLabel.classList.add('input-label', 'inline-block');
    ownerLabel.textContent = 'Owner: ';
    chownDiv.appendChild(ownerLabel);

    this.chownOwner = makeMiniEditor();
    chownDiv.appendChild(this.chownOwner);

    wrapper.appendChild(this.permissionUser);
    wrapper.appendChild(this.permissionGroup);
    wrapper.appendChild(this.permissionOther);
    wrapper.appendChild(chownDiv);

    // Chmod section
    const chmodWrapper = document.createElement('div');
    chmodWrapper.classList.add('permissions-wrapper-block');

    const chmodDiv = document.createElement('div');
    chmodDiv.classList.add('permissions-chmod', 'block');

    const chmodLabel = document.createElement('label');
    chmodLabel.textContent = 'Chmod';
    chmodDiv.appendChild(chmodLabel);

    this.chmodInput = makeMiniEditor();
    this.chmodInput.getModel().setPlaceholderText('600');
    chmodDiv.appendChild(this.chmodInput);
    chmodWrapper.appendChild(chmodDiv);

    // Button block
    const buttonBlock = document.createElement('div');
    buttonBlock.classList.add('block', 'clearfix');

    const cancelButton = document.createElement('button');
    cancelButton.classList.add('inline-block', 'btn', 'pull-right', 'icon', 'icon-x', 'inline-block-tight');
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => this.cancel());

    const saveButton = document.createElement('button');
    saveButton.classList.add('inline-block', 'btn', 'btn-primary', 'pull-right', 'icon', 'icon-sync', 'inline-block-tight');
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => this.confirm());

    buttonBlock.appendChild(cancelButton);
    buttonBlock.appendChild(saveButton);

    this.element.appendChild(wrapper);
    this.element.appendChild(chmodWrapper);
    this.element.appendChild(buttonBlock);

    // Wire up commands
    this.disposables.add(atom.commands.add('atom-workspace', {
      'core:confirm': () => { this.confirm(); },
      'core:cancel': (event) => {
        this.cancel();
        event.stopPropagation();
      },
    }));

    // Set initial permission checkboxes
    Object.keys(params.rights).forEach((right) => {
      const perms = params.rights[right].split('');
      const section = this.element.querySelector(`.permission-${right}`);
      if (!section) return;
      perms.forEach((p) => {
        const inp = section.querySelector(`input[data-perm="${p}"]`);
        if (inp) inp.checked = true;
      });
    });

    this.chownGroup.getModel().setPlaceholderText(params.group);
    this.chownOwner.getModel().setPlaceholderText(params.owner);

    this.disposables.add(
      atom.tooltips.add(this.chownGroup, {
        title: 'Only number can be entered. (Valid GID)',
        placement: 'bottom',
      }),
      atom.tooltips.add(this.chownOwner, {
        title: 'Only number can be entered. (Valid UID)',
        placement: 'bottom',
      }),
    );

    this.checkPermissions();
    this.show();

    Array.from(this.element.querySelectorAll('.permissions-wrapper input')).forEach((inp) => {
      inp.addEventListener('change', () => this.checkPermissions());
    });
  }

  checkPermissions() {
    this.chmod = {
      user: 0,
      group: 0,
      other: 0,
      get toString() {
        return `${this.user}${this.group}${this.other}`;
      },
    };

    const chmods = {
      user: this.permissionUser,
      group: this.permissionGroup,
      other: this.permissionOther,
    };

    Object.keys(chmods).forEach((cKey) => {
      const section = chmods[cKey];
      const inputs = Array.from(section.querySelectorAll('input'));
      const list = {};

      inputs.forEach((inp) => {
        list[inp.getAttribute('data-perm')] = inp.checked;
      });

      Object.keys(list).filter(key => list[key]).forEach((key) => {
        this.chmod[cKey] += this.right[key];
      });
    });

    this.chmodInput.getModel().setText(this.chmod.toString);
  }

  checkOwners() {
    const groupText = this.chownGroup.getModel().getText();
    const ownerText = this.chownOwner.getModel().getText();

    if (groupText === '' && ownerText === '') return;

    const group = groupText || this.chownGroup.getModel().getPlaceholderText();
    const owner = ownerText || this.chownOwner.getModel().getPlaceholderText();

    if (atom.project.remoteftp.info.protocol === 'sftp') {
      if (groupText !== '' || ownerText !== '') {
        this.ftp.client.chown(this.item.remote, owner - 0, group - 0, (response) => {
          if (response && /Permission denied/g) {
            isPermissionDenied(this.item.remote);
          } else if (response) {
            isNoChangeOwnerAndGroup(response);
          }
        });
      }
    } else {
      if (groupText !== '') {
        this.ftp.client.chgrp(this.item.remote, group, (response) => {
          if (response) isNoChangeGroup(response);
        });
      }

      if (ownerText !== '') {
        this.ftp.client.chown(this.item.remote, owner, (response) => {
          if (response) isNoChangeOwner(response);
        });
      }
    }
  }

  confirm() {
    this.hide();
    this.checkOwners();

    this.ftp.client.chmod(this.item.remote, this.chmodInput.getModel().getText(), (response) => {
      if (response && /Permission denied/g) {
        isPermissionDenied(this.item.remote);
      } else if (response) {
        console.error(response);
      }
    });
    this.item.parent.open();

    this.checkPermissions();
    this.destroy();
  }

  cancel() {
    this.hide();
    this.destroy();
  }

  show() {
    this.panel = atom.workspace.addModalPanel({ item: this.element });
    this.panel.show();
  }

  hide() {
    if (this.panel) this.panel.hide();
  }

  destroy() {
    this.disposables.dispose();
    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    this.element.remove();
  }
}

export default PermissionView;
