import '../shared/surface/material.js';
import {installShadowReducedMotion} from '../shared/surface/reduced-motion.js';
if(typeof document!=='undefined')installShadowReducedMotion(document);

const ICONS = {
  info: 'M11 17h2v-6h-2v6Zm1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-1-11h2V7h-2v2Z',
  question: 'M11 18h2v-2h-2v2Zm1-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 0 0-4-4Z',
  warning: 'M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z',
  error: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z',
};

/** Renders a main-process prompt with Material components and reports one choice. */
async function start() {
  const api = window.materialDialog;
  const view = await api.view();
  document.documentElement.dataset.theme = view.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.lang = view.language === 'yue' ? 'yue-Hant' : 'en';
  document.title = view.title || view.message;
  const title = document.getElementById('dialog-title');
  title.textContent = view.title;
  title.hidden = !view.title;
  document.body.dataset.type = view.type;
  document.getElementById('dialog-message').textContent = view.message;
  const detail = document.getElementById('dialog-detail');
  detail.textContent = view.detail;
  detail.hidden = !view.detail;
  const iconHost = document.getElementById('dialog-icon');
  if (ICONS[view.type]) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
    svg.setAttribute('viewBox', '0 0 24 24');
    path.setAttribute('d', ICONS[view.type]);
    svg.append(path);
    iconHost.append(svg);
  } else iconHost.hidden = true;
  let answered = false;
  const answer = index => { if (answered) return; answered = true; api.respond(view.nonce, index); };
  const actions = document.getElementById('dialog-actions');
  const buttons = view.buttons.map((label, index) => {
    const tag = index === view.defaultId && index !== view.cancelId ? 'md-filled-button' : index === view.cancelId ? 'md-text-button' : 'md-outlined-button';
    const button = document.createElement(tag);
    button.textContent = label;
    button.type = 'button';
    button.addEventListener('click', () => answer(index));
    actions.append(button);
    return button;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); answer(view.cancelId); }
  });
  requestAnimationFrame(() => {
    buttons[view.defaultId]?.focus();
    api.resize(document.querySelector('.material-dialog').scrollHeight + 8);
  });
}

start().catch(() => document.body.classList.add('material-dialog-failed'));
