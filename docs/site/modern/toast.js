// Non-blocking notifications. The region is a polite live region; toasts never take focus and expire on their own.
let region = null;
export function toast(message, {error = false, timeout = 4200} = {}) {
 if (!region) {
  region = document.createElement('div');
  region.className = 'site-toasts';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.append(region);
 }
 const node = document.createElement('div');
 node.className = 'site-toast' + (error ? ' error' : '');
 const dot = document.createElement('span');
 dot.className = 'toast-dot';
 dot.setAttribute('aria-hidden', 'true');
 const text = document.createElement('span');
 text.textContent = message;
 node.append(dot, text);
 region.append(node);
 setTimeout(() => node.remove(), timeout);
 return node;
}
