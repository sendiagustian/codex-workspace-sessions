/* global document, window */
(() => {
  const vscode = window.acquireVsCodeApi();
  const search = document.getElementById('search');
  const clear = document.getElementById('clear');
  const list = document.getElementById('list');
  const status = document.getElementById('message');
  const enable = document.getElementById('enable');
  const send = (type, id) => vscode.postMessage({ type, id });
  const query = () => { clear.hidden = search.value === ''; vscode.postMessage({ type: 'search', query: search.value }); };
  search.addEventListener('input', query);
  clear.addEventListener('click', () => { search.value = ''; search.focus(); query(); });
  document.getElementById('new').addEventListener('click', () => send('newSession'));
  enable.addEventListener('click', () => send('enable'));

  const PATHS = {
    session: 'M2.75 3.25h10.5v7h-6l-3 2.5v-2.5h-1.5z',
    pin: 'M4.75 2.5h6.5v11l-3.25-2.5-3.25 2.5z',
    more: 'M4 8h.01M8 8h.01M12 8h.01',
  };

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PATHS[name]);
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.append(path);
    return svg;
  }

  function button(label, className, title, action) {
    const element = document.createElement('button');
    if (typeof label === 'string') element.textContent = label;
    else element.append(label);
    element.className = className;
    element.title = title;
    element.setAttribute('aria-label', title);
    element.addEventListener('click', action);
    return element;
  }

  function row(session, pinned) {
    const container = document.createElement('div');
    const line = document.createElement('div');
    line.className = 'session';
    const open = button(icon('session'), 'open', `${session.title}\n${session.cwd}\n${new Date(session.updatedAt).toLocaleString()}`, () => send('open', session.id));
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = session.title;
    open.append(title);
    const pin = button(icon('pin'), 'pin', pinned ? 'Unpin session' : 'Pin session', () => send('pin', session.id));
    pin.setAttribute('aria-pressed', String(pinned));
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.hidden = true;
    actions.append(button('Details', '', 'Show session details', () => send('details', session.id)), button('Copy resume', '', 'Copy CLI resume command', () => send('copyResume', session.id)));
    const more = button(icon('more'), 'more', 'Session actions', () => {
      actions.hidden = !actions.hidden;
      more.setAttribute('aria-expanded', String(!actions.hidden));
    });
    more.setAttribute('aria-expanded', 'false');
    line.append(open, pin, more);
    container.append(line, actions);
    container.dataset.id = session.id;
    return container;
  }

  window.addEventListener('message', ({ data }) => {
    if (data.type === 'focusSearch') { search.focus(); search.select(); return; }
    if (data.type !== 'sessions') return;
    const focused = document.activeElement;
    const selectedId = focused?.closest('[data-id]')?.dataset.id;
    const selectedClass = focused?.classList[0];
    list.replaceChildren(...data.sessions.map(session => row(session, data.pins.includes(session.id))));
    status.textContent = data.message ?? '';
    enable.hidden = !data.message?.includes('access is disabled');
    if (document.activeElement !== search) search.value = data.query;
    clear.hidden = search.value === '';
    if (selectedId && selectedClass) {
      const item = [...list.children].find(element => element.dataset.id === selectedId);
      const target = item && [...item.querySelectorAll('button')].find(element => element.classList.contains(selectedClass));
      target?.focus();
    }
  });
  send('ready');
})();
