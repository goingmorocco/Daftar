// Small UI toolkit: escaping, icons, modals, toasts, form helpers.

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = esc;

const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.6c1.8.7 3 2.4 3.5 5.4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/>',
  bell: '<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  teacher: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c.6-4 3.4-6.5 7-6.5s6.4 2.5 7 6.5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  team: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M10.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>', chevR: '<path d="M9 6l6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-3.9-1z"/><path d="M9 9.5c.3 2 2.3 4.2 4.6 4.8l1-1.2 2 .9c-.3 1.2-1.2 1.8-2.4 1.6C11 15 8.8 12.8 8.4 10.6c-.2-1.2.4-2.1 1.6-2.4l.9 2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  sidebar: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M9 4v16"/><path d="M15 10l-2 2 2 2"/>',
  hourglass: '<path d="M6 3h12M6 21h12"/><path d="M7 3c0 4.5 5 6 5 9s-5 4.5-5 9M17 3c0 4.5-5 6-5 9s5 4.5 5 9"/>',
  bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
  userOut: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5 1.6 0 3 .5 4.2 1.4"/><path d="M16 17h6M19 14l3 3-3 3"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  door: '<path d="M5 21V4a1 1 0 011-1h9l4 2v16"/><path d="M3 21h18"/><circle cx="12.5" cy="12.5" r=".8"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/><path d="M9 8h6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
};
export const icon = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
export const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h11a2 2 0 012 2v16H8a2 2 0 01-2-2z"/><path d="M6 19a2 2 0 012-2h11"/><path d="M10 8h5M10 11.5h3"/></svg>';

// ---------- Toasts ----------
export function toast(msg, type = 'ok') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('role', 'status'); document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3000);
}

// ---------- Modals ----------
/**
 * Opens a modal. `body` is HTML. If `onSubmit` is given, the body is wrapped in a form;
 * onSubmit(data, form) may return false to keep the modal open (or throw to show an error).
 */
export function modal({ title, body, submit = 'Enregistrer', onSubmit, wide = false, extra = '', onOpen, cancel = 'Annuler' }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const inner = `
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn ghost icon" data-close aria-label="Fermer">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${extra}<button type="button" class="btn" data-close>${esc(cancel)}</button>${onSubmit ? `<button type="submit" class="btn primary">${esc(submit)}</button>` : ''}</div>`;
    ov.innerHTML = onSubmit ? `<form class="modal${wide ? ' wide' : ''}" novalidate>${inner}</form>` : `<div class="modal${wide ? ' wide' : ''}">${inner}</div>`;
    document.body.appendChild(ov);
    const close = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => close(null)));
    const form = ov.querySelector('form');
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const missing = [...form.querySelectorAll('[required]')].find(el => !String(el.value).trim());
        if (missing) { missing.focus(); toast('Champ obligatoire manquant.', 'err'); return; }
        const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        try {
          const res = await onSubmit(formData(form), form);
          if (res !== false) close(res ?? true);
        } catch (err) { toast(err.friendly || err.message || String(err), 'err'); }
        finally { btn.disabled = false; }
      });
    }
    const first = ov.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    if (onOpen) onOpen(ov, close);
  });
}

export async function confirmBox(message, { ok = 'Confirmer', danger = true } = {}) {
  return !!(await modal({ title: 'Confirmation', body: `<p>${esc(message)}</p>`, submit: ok, onSubmit: () => true }));
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim();
  }
  return out;
}

// ---------- Field builders ----------
export function field(label, input, cls = '') { return `<label class="f ${cls}">${esc(label)}${input}</label>`; }
export function input(name, value = '', { type = 'text', required = false, placeholder = '', step, min, max } = {}) {
  return `<input name="${name}" type="${type}" value="${attr(value ?? '')}"${required ? ' required' : ''}${placeholder ? ` placeholder="${attr(placeholder)}"` : ''}${step ? ` step="${step}"` : ''}${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}>`;
}
export function select(name, options, value = '', { empty = null, required = false } = {}) {
  const opts = (empty !== null ? `<option value="">${esc(empty)}</option>` : '') +
    options.map(o => `<option value="${attr(o.value)}"${String(o.value) === String(value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  return `<select name="${name}"${required ? ' required' : ''}>${opts}</select>`;
}
export function textarea(name, value = '', rows = 3) { return `<textarea name="${name}" rows="${rows}">${esc(value ?? '')}</textarea>`; }
export const opts = (rows, label = 'name') => rows.map(r => ({ value: r.id, label: typeof label === 'function' ? label(r) : r[label] }));
export const nullIfEmpty = v => (v === '' || v === undefined ? null : v);
export const num = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));

export function emptyState(title, text = '', action = '', ic = 'book') {
  return `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
export function badge(status, label) { return `<span class="badge b-${status}">${esc(label)}</span>`; }
export function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copié.'), () => toast('Copie impossible.', 'err'));
}
