// =============================================================================
// EVENT ADMIN PORTAL (staff only: Admin, Finance, Super Admin + two-factor)
// =============================================================================
// Each section lives in its own file in src/admin/. The menu only shows the
// sections your role may use; the database enforces the same rules.
// =============================================================================
import '../main.js';
import '../styles/app.css';
import { api, isDemo } from '../lib/api.js';
import { $, html, setHTML, showError, router, link, badge, table } from '../lib/ui.js';
import { requireLogin, demoBanner, ROLE_LABELS } from '../lib/session.js';
import { reference, R, withState } from '../lib/data.js';
import { ctx, init, ADMIN, FINANCE, SUPER } from '../admin/context.js';

const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', roles: FINANCE, load: async () => ({ default: dashboard }) },
  { key: 'applications', label: 'Applications', roles: ADMIN, load: () => import('../admin/applications.js') },
  { key: 'invoices', label: 'Invoices', roles: FINANCE, load: () => import('../admin/invoices.js') },
  { key: 'payments', label: 'Payments', roles: FINANCE, load: () => import('../admin/payments.js') },
  { key: 'booths', label: 'Booths & maps', roles: ADMIN, load: () => import('../admin/booths.js') },
  { key: 'volunteers', label: 'Volunteers', roles: ADMIN, load: () => import('../admin/volunteers.js') },
  { key: 'exports', label: 'Exports', roles: FINANCE, load: () => import('../admin/exports.js') },
  { key: 'announcements', label: 'Announcements', roles: ADMIN, load: () => import('../admin/settings.js').then((m) => ({ default: m.announcements })) },
  { key: 'settings', label: 'Settings & users', roles: SUPER, load: () => import('../admin/settings.js').then((m) => ({ default: m.settings })) },
  { key: 'audit', label: 'Audit log', roles: FINANCE, load: () => import('../admin/settings.js').then((m) => ({ default: m.audit })) },
];

async function dashboard() {
  const { ref } = ctx;
  const [apps, items, invoices, payments, refunds, vols, shifts, asg, notes, reports] = await Promise.all([
    api.list('applications'), api.list('application_items'), api.list('invoices'), api.list('payments', { eq: { voided: false } }), api.list('refunds'),
    ctx.can(...ADMIN) ? api.list('volunteers') : [], ctx.can(...ADMIN) ? api.list('shifts') : [], ctx.can(...ADMIN) ? api.list('assignments') : [],
    api.list('payment_notifications', { eq: { status: 'unmatched' } }), api.list('payment_reports', { eq: { status: 'open' } }),
  ]);
  const inv = withState(invoices.filter((i) => i.status !== 'void'), payments, refunds);
  const sent = inv.filter((i) => i.status !== 'draft');
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const lines = await api.list('invoice_lines', { in: { invoice_id: sent.filter((i) => i.status === 'sent').map((i) => i.id) } });
  const byCity = ref.cities.map((c) => ({ c, total: sum(lines.filter((l) => l.city_id === c.id), (l) => l.amount_cents) }));
  const byKind = ['sponsorship', 'booth', 'rental', 'discount', 'custom'].map((k) => ({ k, total: sum(lines.filter((l) => l.line_type === k), (l) => l.amount_cents) })).filter((x) => x.total);
  const statusCount = Object.keys(R.APPLICATION_STATUS_LABELS).map((s) => ({ s, n: apps.filter((a) => a.status === s).length })).filter((x) => x.n);
  const health = await api.health();
  const todo = [
    ctx.can(...ADMIN) && [apps.filter((a) => ['submitted', 'cancel_requested'].includes(a.status)).length, 'applications to review', '#/applications'],
    [inv.filter((i) => i.status === 'draft').length, 'draft invoices to approve and send', '#/invoices'],
    [payments.filter((p) => p.needs_review).length, 'auto-matched payments to double-check', '#/payments'],
    [notes.length + reports.length, 'unmatched payments / vendor reports', '#/payments'],
    [inv.filter((i) => i.state.code === 'overdue').length, 'overdue invoices', '#/invoices'],
  ].filter((x) => x && x[0] > 0);
  ctx.show(html`<h1 class="h2">Dashboard</h1>
    <p class="notice ${health.ok ? 'notice--ok' : 'notice--error'}" role="status">${health.message}</p>
    ${todo.length ? html`<h2 class="h3">To do</h2><ul class="todo-list">${todo.map(([n, t, h]) => html`<li><a href="${h}"><strong>${n}</strong> ${t}</a></li>`)}</ul>` : html`<p class="notice notice--ok">Nothing waiting. Nice work.</p>`}
    <h2 class="h3">Revenue (sent invoices, CAD, no GST)</h2>
    <div class="stat-grid">
      <div class="stat"><span>Invoiced</span><strong>${R.money(sum(sent.filter((i) => i.status === 'sent'), (i) => i.total_cents))}</strong></div>
      <div class="stat"><span>Received</span><strong>${R.money(sum(sent, (i) => i.state.paid_cents))}</strong></div>
      <div class="stat"><span>Owing</span><strong>${R.money(sum(sent, (i) => i.state.owing_cents))}</strong></div>
      <div class="stat"><span>Refunded</span><strong>${R.money(sum(refunds, (r) => r.amount_cents))}</strong></div>
      <div class="stat"><span>Drafts (not sent)</span><strong>${R.money(sum(inv.filter((i) => i.status === 'draft'), (i) => i.total_cents))}</strong></div>
    </div>
    <div class="card-grid">
      <article class="card"><h3 class="h4">By city</h3>${table(byCity, [{ label: 'City', cell: (x) => x.c.name }, { label: 'Invoiced', cell: (x) => R.money(x.total), cls: 'num' }], { caption: 'Revenue by city' })}</article>
      <article class="card"><h3 class="h4">By type</h3>${table(byKind, [{ label: 'Type', cell: (x) => x.k }, { label: 'Invoiced', cell: (x) => R.money(x.total), cls: 'num' }], { caption: 'Revenue by type', empty: 'No invoices sent yet.' })}</article>
      <article class="card"><h3 class="h4">Applications</h3>${table(statusCount, [{ label: 'Status', cell: (x) => badge(x.s, R.APPLICATION_STATUS_LABELS[x.s]) }, { label: 'Count', cell: (x) => x.n, cls: 'num' }], { caption: 'Applications by status', empty: 'No applications yet.' })}
        <p class="hint">${items.length} booth / sponsorship items across ${new Set(items.map((i) => i.application_id)).size} applications.</p></article>
      ${ctx.can(...ADMIN) ? html`<article class="card"><h3 class="h4">Volunteers</h3>${table(ref.cities, [
        { label: 'City', cell: (c) => c.name },
        { label: 'Signed up', cell: (c) => vols.filter((v) => v.city_id === c.id).length, cls: 'num' },
        { label: 'Shifts filled', cell: (c) => { const s = shifts.filter((x) => x.city_id === c.id); const ids = new Set(s.map((x) => x.id)); return `${asg.filter((a) => ids.has(a.shift_id)).length} / ${s.length}`; }, cls: 'num' },
      ], { caption: 'Volunteer coverage' })}</article>` : ''}
    </div>`, 'Dashboard');
}

(async () => {
  init();
  demoBanner();
  ctx.me = await requireLogin({ staff: true, next: 'admin' });
  ctx.role = ctx.me.profile.role;
  ctx.ref = await reference();
  $('#who').textContent = `${ctx.me.profile.full_name || ctx.me.user.email} · ${ROLE_LABELS[ctx.role]}`;
  const mine = SECTIONS.filter((s) => s.roles.includes(ctx.role));
  setHTML($('#admin-nav'), html`${mine.map((s) => html`<li><a href="#/${s.key}">${s.label}</a></li>`)}`);
  $('#sign-out').addEventListener('click', async () => { await api.auth.signOut(); location.assign(link('login/')); });
  const routes = Object.fromEntries(mine.map((s) => [s.key, async (params) => {
    const mod = await s.load();
    await mod.default(params);
  }]));
  router(routes, 'dashboard', (name) => {
    document.querySelectorAll('#admin-nav a').forEach((a) => (a.getAttribute('href') === `#/${name}` ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  });
})().catch((e) => { showError(e); setHTML($('#view'), html`<p class="notice notice--error" role="alert">${e.message}</p>`); });
