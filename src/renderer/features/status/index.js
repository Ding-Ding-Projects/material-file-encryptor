export function mountStatus(host, { getStatus, translate = value => value } = {}) {
  host.replaceChildren();
  const title = document.createElement('h2'); title.textContent = translate('Status');
  const description = document.createElement('p'); description.setAttribute('role', 'status');
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = translate('Refresh status');
  host.append(title, description, refresh); let generation = 0, disposed = false;
  async function update() {
    const request = ++generation; refresh.disabled = true;
    try {
      const state = typeof getStatus === 'function' ? await getStatus() : { state: 'unavailable' };
      if (disposed || request !== generation) return;
      description.textContent = translate(state.state === 'configured' ? 'Status client is configured.' : 'Status updates are unavailable. Check trusted-process configuration.');
      if (state.lastSuccessAt && !Number.isNaN(Date.parse(state.lastSuccessAt))) description.append(document.createTextNode(` ${translate('Last accepted update')}: ${new Date(state.lastSuccessAt).toLocaleString()}`));
    } catch { if (!disposed && request === generation) description.textContent = translate('Status could not be read. Retry when the connection is available.'); }
    finally { if (!disposed && request === generation) refresh.disabled = false; }
  }
  refresh.addEventListener('click', update); update();
  return { refresh: update, destroy() { disposed = true; generation++; host.replaceChildren(); } };
}
