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
   const button = document.createElement('button'); button.type = 'button'; button.className = 'field-clear';
   const glyph = document.createElement('span'); glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = '×'; button.append(glyph);
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
