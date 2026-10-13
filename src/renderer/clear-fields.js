const editableTypes = new Set(['text', 'search', 'password', 'email', 'url', 'tel', 'number']);

// One enhancement for both static forms and dynamically mounted search controls.
// Values never enter labels, attributes, storage, or diagnostic output.
export function installClearFields(root, translate) {
 const document = root.ownerDocument || root;
 const records = new Map();
 function refresh() {
  for (const [input, {wrapper, button}] of records) {
   if (!input.isConnected) { records.delete(input); continue; }
   const hidden = input.hidden || (input.tagName === 'INPUT' && !editableTypes.has(input.type));
   if (wrapper.hidden !== hidden) wrapper.hidden = hidden;
   const disabled = input.matches(':disabled') || input.readOnly;
   if (button.disabled !== disabled) button.disabled = disabled;
   const label = input.getAttribute('aria-label') || [...(input.labels || [])].map(el => el.textContent.trim()).join(' ') || translate('Text field');
   const name = `${translate('Clear field')}: ${label}`;
   if (button.getAttribute('aria-label') !== name) button.setAttribute('aria-label', name);
   if (button.title !== name) button.title = name;
  }
 }
 function enhance() {
  for (const input of root.querySelectorAll('input,textarea')) {
   if (records.has(input) || (input.tagName === 'INPUT' && !editableTypes.has(input.type))) continue;
   const wrapper = document.createElement('span'); wrapper.className = 'clearable-field';
   const button = document.createElement('md-icon-button'); button.type = 'button'; button.className = 'field-clear';
   const namespace = 'http://www.w3.org/2000/svg';
   const glyph = document.createElementNS(namespace, 'svg');
   for (const [name, value] of Object.entries({viewBox:'0 0 24 24', width:'24', height:'24', 'aria-hidden':'true', focusable:'false'})) glyph.setAttribute(name, value);
   const path = document.createElementNS(namespace, 'path');
   path.setAttribute('fill', 'currentColor');
   path.setAttribute('d', 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12Z');
   glyph.append(path); button.append(glyph);
   input.before(wrapper); wrapper.append(input, button); records.set(input, {wrapper, button});
   button.addEventListener('click', () => {
    if (input.matches(':disabled') || input.readOnly) return;
    input.value = '';
    input.setCustomValidity('');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    input.focus({preventScroll:true});
   });
  }
  refresh();
 }
 enhance();
 const observer = new MutationObserver(enhance);
 observer.observe(root, {subtree:true, childList:true, attributes:true, attributeFilter:['disabled','readonly','hidden','type','aria-label']});
 return {refresh: enhance, disconnect: () => observer.disconnect()};
}
