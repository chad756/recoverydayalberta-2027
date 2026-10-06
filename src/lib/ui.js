// =============================================================================
// Small UI helpers shared by the portal, admin and volunteer pages.
// =============================================================================
// html`...` builds HTML safely: every ${value} is escaped, so text typed by a
// user can never run as code. Use raw(...) only for HTML you built yourself.
// =============================================================================

const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: String(s ?? '') });
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function part(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && RAW in v) return v[RAW];
  return esc(v);
}
export function html(strings, ...values) {
  return raw(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''));
}
export function setHTML(el, content) {
  el.innerHTML = part(content);
  // Map pins: positions come from data-x / data-y (percent). Setting them here
  // keeps the strict Content Security Policy (no inline style="" attributes).
  for (const pin of el.querySelectorAll('[data-x][data-y]')) {
    pin.style.left = `${Number(pin.dataset.x)}%`;
    pin.style.top = `${Number(pin.dataset.y)}%`;
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Base path of the site (works on github.io, the real domain and previews). */
export const BASE = document.querySelector('meta[name="rda-base"]')?.content || '/';
const relative = !BASE.startsWith('/');
/** Link to another page, e.g. link('portal/') or link('login/', '?next=apply'). */
export function link(page = '', extra = '') {
  const p = relative && (page === '' || page.endsWith('/')) ? `${page}index.html` : page;
  return `${BASE}${p}${extra}`;
}

// ---- Messages ---------------------------------------------------------------
let live;
/** Short message announced to screen readers and shown at the bottom. */
export function toast(message, type = 'ok') {
  if (!live) {
    live = document.createElement('div');
    live.className = 'toast-area';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.append(live);
  }
  const t = document.createElement('p');
  t.className = `toast toast--${type}`;
  t.textContent = message;
  live.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 9000 : 5000);
}
export function showError(e) { console.error(e); toast(e?.message || String(e), 'error'); }

/** Disable a button while work runs; show errors as messages. */
export async function busy(button, fn) {
  const label = button?.textContent;
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try { return await fn(); } catch (e) { showError(e); return undefined; } finally {
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = label; }
  }
}

// ---- Dialogs (native <dialog>: focus trapping + Esc for free) --------------
/**
 * Opens a dialog with a form. `body` is html`` content with inputs.
 * Resolves with the form values (object) or null if cancelled.
 */
export function formDialog({ title, body, submit = 'Save', cancel = 'Cancel', danger = false, wide = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = `app-dialog${wide ? ' app-dialog--wide' : ''}`;
    d.setAttribute('aria-labelledby', 'dlg-title');
    setHTML(d, html`<form method="dialog" class="stack" novalidate>
      <h2 id="dlg-title" class="h3">${title}</h2>
      <div class="stack">${body}</div>
      <p class="form-error" role="alert" hidden></p>
      <div class="button-row">
        <button class="button ${danger ? 'button--danger' : 'button--primary'}" value="ok">${submit}</button>
        <button class="button button--outline" value="cancel" formnovalidate>${cancel}</button>
      </div></form>`);
    document.body.append(d);
    const form = d.querySelector('form');
    form.addEventListener('submit', (e) => {
      const v = e.submitter?.value;
      if (v === 'ok' && !form.checkValidity()) {
        e.preventDefault();
        const bad = form.querySelector(':invalid');
        const err = form.querySelector('.form-error');
        err.hidden = false;
        err.textContent = bad?.validationMessage ? `${labelFor(bad)}: ${bad.validationMessage}` : 'Please check the form.';
        bad?.focus();
        return;
      }
      d.returnValue = v;
    });
    d.addEventListener('close', () => {
      const ok = d.returnValue === 'ok';
      const values = ok ? formValues(form) : null;
      d.remove();
      resolve(values);
    });
    d.showModal();
    d.querySelector('input, select, textarea, button')?.focus();
  });
}
export async function confirmDialog(title, message, { submit = 'Yes', danger = false } = {}) {
  return (await formDialog({ title, body: html`<p>${message}</p>`, submit, danger })) !== null;
}
function labelFor(el) {
  return (el.labels?.[0]?.textContent || el.name || 'Field').replace(/\s*\*$/, '').trim();
}

/** All named fields of a form → object (checkbox groups → arrays). */
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      const group = form.querySelectorAll(`input[type=checkbox][name="${CSS.escape(el.name)}"]`).length > 1;
      if (group) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else out[el.name] ??= ''; }
    else if (el.type === 'file') out[el.name] = el.files;
    else out[el.name] = el.value;
  }
  return out;
}

// ---- Downloads --------------------------------------------------------------
export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function downloadJson(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

// ---- Bits of UI -------------------------------------------------------------
const BADGE = {
  ok: ['accepted', 'paid', 'approved', 'confirmed', 'matched', 'deposit_paid', 'published', 'checked_in'],
  warn: ['submitted', 'under_review', 'deposit_due', 'partial', 'pending', 'waitlisted', 'draft', 'open', 'changes_requested', 'cancel_requested'],
  bad: ['declined', 'overdue', 'rejected', 'unmatched', 'cancelled', 'void', 'refunded', 'declined_shift'],
};
const BADGE_LABELS = { published: 'Emailed – waiting', confirmed: 'Confirmed', draft: 'Draft', declined_shift: 'Declined', checked_in: 'Checked in' };
export function badge(code, label) {
  const tone = BADGE.ok.includes(code) ? 'ok' : BADGE.bad.includes(code) ? 'bad' : BADGE.warn.includes(code) ? 'warn' : 'neutral';
  return html`<span class="badge badge--${tone}">${label ?? BADGE_LABELS[code] ?? String(code).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</span>`;
}

/** Simple accessible table. cols: [{label, cell: row => html|string, cls}] */
export function table(rows, cols, { caption, empty = 'Nothing here yet.', rowClass } = {}) {
  if (!rows.length) return html`<p class="empty">${empty}</p>`;
  return html`<div class="table-wrap" tabindex="0" role="region" aria-label="${caption || 'Table'}"><table class="data-table">
    ${caption ? html`<caption class="sr-only">${caption}</caption>` : ''}
    <thead><tr>${cols.map((c) => html`<th scope="col" class="${c.cls || ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr class="${rowClass ? rowClass(r) : ''}">${cols.map((c, i) => (i === 0
      ? html`<th scope="row" class="${c.cls || ''}">${c.cell(r)}</th>`
      : html`<td class="${c.cls || ''}">${c.cell(r)}</td>`))}</tr>`)}</tbody></table></div>`;
}

export function field({ label, name, type = 'text', value = '', required = false, hint = '', attrs = '', options, rows = 3, id }) {
  const fid = id || `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  const hintId = hint ? `${fid}-hint` : '';
  const star = required ? html`<span aria-hidden="true"> *</span>` : '';
  const describe = hintId ? raw(` aria-describedby="${hintId}"`) : '';
  let control;
  if (type === 'select') {
    control = html`<select id="${fid}" name="${name}" ${required ? raw('required') : ''}${describe} ${raw(attrs)}>
      ${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option value="${v}" ${String(v) === String(value ?? '') ? raw('selected') : ''}>${l}</option>`; })}</select>`;
  } else if (type === 'textarea') {
    control = html`<textarea id="${fid}" name="${name}" rows="${rows}" ${required ? raw('required') : ''}${describe} ${raw(attrs)}>${value ?? ''}</textarea>`;
  } else {
    control = html`<input id="${fid}" name="${name}" type="${type}" value="${value ?? ''}" ${required ? raw('required') : ''}${describe} ${raw(attrs)}>`;
  }
  return html`<div class="field"><label for="${fid}">${label}${star}</label>${hint ? html`<p class="hint" id="${hintId}">${hint}</p>` : ''}${control}</div>`;
}

export function check({ label, name, value = 'on', checked = false, hint = '', required = false }) {
  const id = `c-${name}-${String(value).replace(/\W/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
  return html`<div class="check"><input type="checkbox" id="${id}" name="${name}" value="${value}" ${checked ? raw('checked') : ''} ${required ? raw('required') : ''}>
    <label for="${id}">${label}${hint ? html`<span class="hint">${hint}</span>` : ''}</label></div>`;
}

/** Hash router: routes = { 'invoices': fn(params), ... }. '#/invoices/abc' → fn(['abc']). */
export function router(routes, fallback, onChange) {
  const go = () => {
    const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const fn = routes[name] || routes[fallback];
    onChange?.(routes[name] ? name : fallback);
    Promise.resolve(fn(params)).catch(showError);
  };
  window.addEventListener('hashchange', go);
  go();
  return go;
}

/** Validate a file before upload (10 MB, PDF/JPG/PNG). */
export function checkFile(file, { maxMb = 10, types = ['application/pdf', 'image/jpeg', 'image/png'] } = {}) {
  if (!file) return 'Please choose a file.';
  if (file.size > maxMb * 1024 * 1024) return `“${file.name}” is larger than ${maxMb} MB.`;
  if (!types.includes(file.type)) return `“${file.name}” must be a PDF, JPG or PNG.`;
  return null;
}
