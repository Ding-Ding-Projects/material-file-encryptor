// Two-key super confirmation for pages that do not carry the static confirmation dialog (the toolbar popup).
//
// Behaviour matches the workspace dialog and the shared desktop component: it names the exact action and the data it
// touches, needs two independently operated keys before the full-range slider enables, animates progress and completion
// unless the platform asks for reduced motion, always offers Emergency exit, closes on Escape, and returns focus.
// Nothing runs until both keys are on and the slider is complete.
import {extensionDestructive, destructiveDescription} from './destructive-confirm.js';

const COPY = Object.freeze({
  keys: [['First confirmation key', '第一個確認開關'], ['Second confirmation key', '第二個確認開關']],
  help: ['Turn on both confirmation switches, then move the slider fully right and choose Execute.', '開啟兩個確認開關，然後將滑桿推到最右，再撳「執行」。'],
  escape: ['Press Escape or choose Emergency exit to leave without changes.', '按 Escape 或者揀「緊急離開」，就可以不作任何更改離開。'],
  progress: ['Confirmation progress', '確認進度'],
  execute: ['Execute', '執行'],
  exit: ['Emergency exit', '緊急離開'],
  done: ['Done', '完成']
});

const pick = (pair, language) => language === 'yue' ? pair[1] : language === 'bilingual' ? pair[0] + ' · ' + pair[1] : pair[0];

function reduced(win) {
  try { return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { return false; }
}

/** Resolves true after the registered action's two keys and slider are complete, otherwise false. */
export function superConfirm(doc, id, {language = 'en', detail} = {}) {
  const entry = extensionDestructive(id), win = doc.defaultView, origin = doc.activeElement;
  const text = pair => pick(pair, language);
  return new Promise(resolve => {
    const make = (tag, props = {}) => { const node = doc.createElement(tag); for (const [key, value] of Object.entries(props)) { if (key === 'text') node.textContent = value; else if (key in node) node[key] = value; else node.setAttribute(key, value); } return node; };
    const dialog = make('md-dialog', {'aria-label': text(entry.title), 'data-destructive-id': id});
    const headline = make('span', {slot: 'headline', text: text(entry.title)});
    const content = make('div', {slot: 'content'});
    const first = make('md-switch', {'aria-label': text(COPY.keys[0])}), second = make('md-switch', {'aria-label': text(COPY.keys[1])});
    const slider = make('md-slider', {min: 0, max: 100, value: 0, disabled: true, 'aria-label': text(COPY.progress)});
    const progress = make('md-linear-progress', {value: 0, max: 1, 'aria-label': text(COPY.progress)});
    const status = make('p', {role: 'status', 'aria-live': 'polite'});
    const exit = make('md-text-button', {slot: 'actions', text: text(COPY.exit)}), execute = make('md-filled-button', {slot: 'actions', text: text(COPY.execute), disabled: true});
    content.append(make('p', {text: text(destructiveDescription(id, detail))}), make('p', {text: text(COPY.help) + ' ' + text(COPY.escape)}), first, second, slider, status, progress);
    dialog.append(headline, content, exit, execute);
    let closed = false;
    const update = () => {
      slider.disabled = !(first.selected && second.selected);
      if (slider.disabled) slider.value = 0;
      const amount = Number(slider.value) || 0;
      execute.disabled = !(first.selected && second.selected && amount >= 100);
      progress.value = Math.max(0, Math.min(100, amount)) / 100;
      status.textContent = text(COPY.progress) + ': ' + amount + '%';
    };
    const finish = result => {
      if (closed) return;
      closed = true;
      doc.removeEventListener('keydown', onKey);
      try { dialog.close?.(); } catch { /* the dialog may already be closing */ }
      dialog.remove();
      origin?.focus?.();
      resolve(result);
    };
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault?.(); finish(false); } };
    first.addEventListener('change', update); second.addEventListener('change', update);
    slider.addEventListener('input', update); slider.addEventListener('change', update);
    exit.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', event => { event.preventDefault?.(); finish(false); });
    execute.addEventListener('click', () => {
      update();
      if (execute.disabled || closed) return;
      progress.value = 1;
      status.textContent = text(COPY.done);
      const animate = !reduced(win) && typeof status.animate === 'function';
      if (animate) { try { status.animate([{opacity: 0, transform: 'scale(0.96)'}, {opacity: 1, transform: 'scale(1)'}], {duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)'}); } catch { /* decoration only */ } }
      if (animate) win.setTimeout(() => finish(true), 220); else finish(true);
    });
    doc.body.append(dialog);
    doc.addEventListener('keydown', onKey);
    update();
    void dialog.show?.();
  });
}
