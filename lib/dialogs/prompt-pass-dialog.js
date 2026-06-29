'use babel';

import { TextBuffer } from 'atom';
import Dialog from './dialog';

const atom = global.atom;

export default class PromptPassDialog extends Dialog {

  constructor(isInteractive = false) {
    super({
      prompt: isInteractive ? 'Enter Vertification Code for keyboard-interactive:' : 'Enter password/passphrase only for this session:',
      select: false,
    });

    const self = this;
    const passwordModel = self.miniEditor.getModel();

    passwordModel.clearTextPassword = new TextBuffer('');

    let changing = false;
    passwordModel.buffer.onDidChange((obj) => {
      if (!changing) {
        changing = true;
        passwordModel.clearTextPassword.setTextInRange(obj.oldRange, obj.newText);
        passwordModel.buffer.setTextInRange(obj.newRange, '*'.repeat(obj.newText.length));
        changing = false;
      }
    });

    // Override core:confirm so it submits the cleartext password rather than
    // the masked buffer. We listen on the element directly; Pulsar dispatches
    // the most-specific listener first, so this takes precedence over the
    // parent Dialog's core:confirm handler without needing to reach into
    // private Atom internals.
    atom.commands.add(self.element, {
      'core:confirm': (event) => {
        event.stopImmediatePropagation();
        self.onConfirm(passwordModel.clearTextPassword.getText());
      },
    });
  }

  onConfirm(pass) {
    this.trigger('dialog-done', [pass]);
  }

}
