// VS Code has no form dialog, so multi-field input is a chain of quick inputs ("1/2", "2/2")
// with a Back button. These helpers build one step each.
import * as vscode from 'vscode';

export const BACK = Symbol('back');

export interface InputStepOptions {
  title: string;
  step: number;
  totalSteps: number;
  value?: string;
  prompt: string;
  placeholder?: string;
  /** Returns an error message, or undefined when the value is fine. Runs when the user presses Enter. */
  validate(value: string): Promise<string | undefined>;
}

/** Resolves to the accepted text, or undefined when the user cancels. */
export function inputStep(o: InputStepOptions): Promise<string | undefined> {
  return new Promise((resolve) => {
    const box = vscode.window.createInputBox();
    box.title = o.title;
    box.step = o.step;
    box.totalSteps = o.totalSteps;
    box.value = o.value ?? '';
    box.prompt = o.prompt;
    box.placeholder = o.placeholder;
    box.ignoreFocusOut = true;
    let done = false;
    box.onDidChangeValue(() => {
      box.validationMessage = undefined;
    });
    box.onDidAccept(async () => {
      box.busy = true;
      box.enabled = false;
      const error = await o.validate(box.value);
      box.busy = false;
      box.enabled = true;
      if (error) {
        box.validationMessage = error;
        return;
      }
      done = true;
      resolve(box.value.trim());
      box.dispose();
    });
    box.onDidHide(() => {
      if (!done) resolve(undefined);
      box.dispose();
    });
    box.show();
  });
}

export interface PickStepOptions {
  title: string;
  step: number;
  totalSteps: number;
  placeholder: string;
  /** Items shown at once. */
  items: string[];
  /** Optional slower work (e.g. git fetch) that returns a fresh item list; the picker shows "busy" meanwhile. */
  refresh?: () => Promise<string[]>;
}

/** Resolves to the picked item, BACK when the user presses Back, or undefined when cancelled. */
export function pickStep(o: PickStepOptions): Promise<string | typeof BACK | undefined> {
  return new Promise((resolve) => {
    const pick = vscode.window.createQuickPick();
    pick.title = o.title;
    pick.step = o.step;
    pick.totalSteps = o.totalSteps;
    pick.placeholder = o.placeholder;
    pick.ignoreFocusOut = true;
    pick.buttons = [vscode.QuickInputButtons.Back];
    pick.items = o.items.map((label) => ({ label }));
    let done = false;
    const finish = (value: string | typeof BACK | undefined) => {
      done = true;
      resolve(value);
      pick.dispose();
    };
    pick.onDidTriggerButton((b) => {
      if (b === vscode.QuickInputButtons.Back) finish(BACK);
    });
    pick.onDidAccept(() => {
      const item = pick.selectedItems[0] ?? pick.activeItems[0];
      if (item) finish(item.label);
    });
    pick.onDidHide(() => {
      if (!done) resolve(undefined);
      pick.dispose();
    });
    if (o.refresh) {
      pick.busy = true;
      o.refresh()
        .then((items) => {
          if (done) return;
          const active = pick.activeItems[0]?.label;
          pick.items = items.map((label) => ({ label }));
          const keep = pick.items.find((i) => i.label === active);
          if (keep) pick.activeItems = [keep];
        })
        .catch(() => {
          if (!done) pick.placeholder = `${o.placeholder} (could not fetch; showing local data)`;
        })
        .finally(() => {
          if (!done) pick.busy = false;
        });
    }
    pick.show();
  });
}
