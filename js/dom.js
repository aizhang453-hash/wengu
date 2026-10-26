// 造网页元素的小工具。用户写的字一律当文字放进去 (textContent), 不会被当成网页代码。

// h('button', { class: 'btn', onclick: fn }, '保存')
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  const later = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'value' || key === 'checked' || key === 'selected') {
      later.push([key, value]); // select 的 value 要等选项放进去以后才设得上
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  for (const [key, value] of later) el[key] = value;
  return el;
}

// 换掉 el 里的东西; 跟 h 一样, null / false 跳过, 数组摊开
// (浏览器自带的 replaceChildren 会把 null 显示成「null」这几个字)
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

// 页面底下弹一句话, 几秒后消失
export function toast(message) {
  document.querySelectorAll('.toast').forEach((old) => old.remove());
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// 让浏览器下载一个文字文件
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 打乱顺序 (返回新数组)
export function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 弹出窗口 (设置用)。点外面、按 Esc、点 ✕ 都会关; closable: false 时只能用里面的按钮关。返回 { el, close }
export function openDialog({ title, body, footer = null, onClose = null, closable = true }) {
  const dialog = h(
    'dialog',
    { class: 'dialog', 'aria-label': title },
    h(
      'div',
      { class: 'dialog-inner' },
      h('div', { class: 'dialog-head' }, h('h2', {}, title), closable ? h('button', { class: 'icon-btn', 'aria-label': '关闭', onclick: () => close() }, '✕') : null),
      h('div', { class: 'dialog-body' }, body),
      footer ? h('div', { class: 'dialog-foot' }, footer) : null,
    ),
  );
  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  // 点到窗口外面的灰色地方
  dialog.addEventListener('click', (e) => {
    if (closable && e.target === dialog) close();
  });
  if (!closable) dialog.addEventListener('cancel', (e) => e.preventDefault()); // 不让 Esc 关
  document.body.append(dialog);
  dialog.showModal();
  return { el: dialog, close };
}

export function dialogOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

// 一行开关: 左边字, 右边开关
export function switchRow({ label, desc = null, checked = false, disabled = false, onchange }) {
  const input = h('input', {
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    checked,
    disabled,
    onchange: (e) => onchange?.(e.target.checked, e.target),
  });
  const row = h(
    'label',
    { class: `switch-row${disabled ? ' disabled' : ''}` },
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), desc ? h('span', { class: 'switch-desc' }, desc) : null),
    input,
  );
  row.input = input;
  return row;
}

// 小图标 (自己画的, 不靠字体, 哪台电脑看都一样)
const ICONS = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  camera: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  play: '<path d="M6 4l14 8-14 8z" fill="currentColor"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13h.01"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  cards: '<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12"/>',
  chart: '<path d="M3 20h18"/><path d="M7 16v-5M12 16V6M17 16v-8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  quiz: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  arcade: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="9" r="2"/><path d="M8 16h3M13 16h3"/>',
  turtle: '<path d="M7 16a7 7 0 0 1 14 0z"/><path d="M3 16h20M9 16v3M18 16v3"/><circle cx="4.5" cy="12.5" r="2.5"/>',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('svg-icon');
  svg.innerHTML = ICONS[name] ?? ''; // 只用上面写死的图形, 没有用户的字
  return svg;
}

// 弹出窗口问一句话 (比如文件夹叫什么)。确定时调 onOk(字)
export function askText({ title, label, value = '', placeholder = '', okText = '确定', onOk }) {
  const input = h('input', { class: 'input', value, placeholder, maxlength: 100, 'aria-label': label });
  const ok = () => {
    const text = input.value.trim();
    if (!text) return input.focus();
    d.close();
    onOk(text);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      ok();
    }
  });
  const d = openDialog({
    title,
    body: [h('label', { class: 'ask-label' }, label), input],
    footer: [h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => d.close() }, '取消'), h('button', { class: 'btn primary', onclick: ok }, okText)],
  });
  input.focus();
  input.select();
  return d;
}

// 点开的小菜单 (「更多」那种)。items: [{ label, icon, href | onclick, danger, disabled }], null 是分隔线。
// 返回按钮; 点外面、按 Esc、换页都会关
export function menuButton(items, { label = '更多', text = '', cls = 'btn', iconName = 'more' } = {}) {
  let pop = null;
  const btn = h('button', { class: cls, type: 'button', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: label, onclick: () => (pop ? close() : open()) }, iconName ? icon(iconName, 18) : null, text || null);
  function close() {
    pop?.remove();
    pop = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    window.removeEventListener('resize', close);
  }
  const outside = (e) => {
    if (!pop?.contains(e.target) && !btn.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      btn.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...pop.querySelectorAll('.pop-item:not([aria-disabled="true"])')];
    const i = list.indexOf(document.activeElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  };
  function open() {
    pop = h(
      'div',
      { class: 'pop-menu', role: 'menu' },
      items.filter((x) => x !== undefined && x !== false).map((it) => {
        if (it === null) return h('div', { class: 'pop-sep', role: 'separator' });
        const props = {
          class: `pop-item${it.danger ? ' danger' : ''}`,
          role: 'menuitem',
          'aria-disabled': it.disabled ? 'true' : null,
          onclick: (e) => {
            if (it.disabled) return e.preventDefault();
            close();
            it.onclick?.(e);
          },
        };
        return it.href && !it.disabled ? h('a', { ...props, href: it.href }, it.icon ? icon(it.icon, 18) : null, h('span', {}, it.label)) : h('button', { ...props, type: 'button' }, it.icon ? icon(it.icon, 18) : null, h('span', {}, it.label));
      }),
    );
    document.body.append(pop);
    // 放在按钮下面, 靠右的按钮往左展开; 下面放不下就放上面
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    const below = r.bottom + 6 + pop.offsetHeight < window.innerHeight;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${(below ? r.bottom + 6 : r.top - 6 - pop.offsetHeight) + window.scrollY}px`;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', close);
    window.addEventListener('resize', close);
    pop.querySelector('.pop-item:not([aria-disabled="true"])')?.focus({ preventScroll: true });
  }
  return btn;
}
