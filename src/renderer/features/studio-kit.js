import {control} from '../../shared/surface/controls.js';

/**
 * Small construction kit shared by the type generator, the virtual disk manager and the world generator.
 * Every visible string is passed as an English and Cantonese pair, and the kit joins them for the current language mode.
 */
export function createKit(root, {getLanguage = () => 'en', subscribeLanguage} = {}) {
  const doc = root.ownerDocument || document;
  const tr = (en, yue) => {
    const language = getLanguage();
    return language === 'yue' ? yue : language === 'bilingual' ? en + ' · ' + yue : en;
  };
  const el = (tag, props = {}, children = []) => {
    const node = control(tag, props, [], doc);
    for (const child of [].concat(children)) if (child !== null && child !== undefined) node.append(typeof child === 'object' ? child : doc.createTextNode(String(child)));
    return node;
  };
  const plain = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (en, yue, onClick, {variant = 'outlined', disabled = false, title} = {}) => {
    const node = el('button', {class: variant === 'primary' ? 'primary' : variant === 'text' ? '' : 'outlined', 'aria-label': tr(en, yue)}, [tr(en, yue)]);
    if (title) node.title = title;
    node.disabled = disabled;
    node.addEventListener('click', () => { if (!node.disabled) onClick(); });
    return node;
  };
  const textField = (en, yue, value, onInput, {multiline = false, rows = 8, type = 'text', hint = '', readOnly = false} = {}) => {
    const node = el(multiline ? 'textarea' : 'input', {type, label: tr(en, yue), 'aria-label': tr(en, yue), value: value ?? '', ...(multiline ? {rows} : {})});
    if (readOnly) node.readOnly = true;
    if (hint) node.setAttribute('supporting-text', hint);
    node.addEventListener('input', () => onInput(node.value));
    return node;
  };
  const select = (en, yue, options, value, onChange) => {
    const node = el('select', {label: tr(en, yue), 'aria-label': tr(en, yue)});
    for (const [optionValue, label] of options) node.append(el('option', {value: optionValue, text: label, selected: optionValue === value}));
    node.value = value;
    node.addEventListener('change', () => onChange(node.value));
    return node;
  };
  const toggle = (en, yue, checked, onChange, {disabled = false, hint = ''} = {}) => {
    const input = el('input', {type: 'checkbox', checked: !!checked, 'aria-label': tr(en, yue)});
    input.disabled = disabled;
    input.addEventListener('change', () => onChange(!!input.checked));
    const label = plain('label', 'studio-toggle');
    label.append(input, doc.createTextNode(' ' + tr(en, yue)));
    if (hint) label.title = hint;
    return label;
  };
  const status = () => {
    const node = plain('p', 'studio-status');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    return node;
  };
  const disposers = [];
  const onLanguage = render => {
    if (typeof subscribeLanguage === 'function') {
      const off = subscribeLanguage(render);
      if (typeof off === 'function') disposers.push(off);
    }
  };
  return {doc, tr, el, plain, button, textField, select, toggle, status, onLanguage, disposers, destroy() { disposers.splice(0).forEach(dispose => dispose()); }};
}

/** Error text that survives the personal wording pass: it is shown through the same status element as every other message. */
export function errorText(error) {
  const message = error && error.message ? String(error.message) : String(error);
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '').slice(0, 500);
}
