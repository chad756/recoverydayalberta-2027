// Admin → Volunteers: sign-ups, auto-schedule, manual changes, publish, check-in.
import { api } from '../lib/api.js';
import { $, html, raw, toast, showError, busy, confirmDialog, badge, table, field } from '../lib/ui.js';
import { R } from '../lib/data.js';
import { ctx } from './context.js';

const PREF = Object.fromEntries(R.VOLUNTEER_PREFERENCES.map((p) => [p.key, p.label]));
let cityId = null;
let tab = 'schedule';
let q = '';

export default async function volunteers() {
  const { ref } = ctx;
  cityId ||= ref.cities.find((c) => c.id === 'red-deer')?.id || ref.cities[0]?.id;
  const city = ref.city(cityId);
  const [vols, shifts, allAsg, declines] = await Promise.all([
    api.list('volunteers', { eq: { city_id: cityId }, order: 'created_at' }), api.list('shifts', { eq: { city_id: cityId }, order: 'sort' }),
    api.list('assignments'), api.list('declines'),
  ]);
  const shiftIds = new Set(shifts.map((s) => s.id));
  const asg = allAsg.filter((a) => shiftIds.has(a.shift_id));
  const active = vols.filter((v) => v.status === 'active');
  const filled = asg.length;
  const draftCount = asg.filter((a) => a.status === 'draft').length;
  const confirmed = asg.filter((a) => a.status === 'confirmed').length;
  const vById = Object.fromEntries(vols.map((v) => [v.id, v]));
  const shiftsOf = (vid) => asg.filter((a) => a.volunteer_id === vid).map((a) => shifts.find((s) => s.id === a.shift_id));

  const head = html`<h1 class="h2">Volunteers</h1>
    <div class="filters">${field({ label: 'City', name: 'city', type: 'select', value: cityId, options: ref.cities.map((c) => [c.id, c.name]), id: 'vcity' })}</div>
    <div class="stat-grid">
      <div class="stat"><span>Signed up</span><strong>${active.length}</strong></div>
      <div class="stat"><span>Shifts filled</span><strong>${filled} / ${shifts.length}</strong></div>
      <div class="stat"><span>Empty shifts</span><strong>${shifts.length - filled}</strong></div>
      <div class="stat"><span>Confirmed</span><strong>${confirmed}</strong></div>
      <div class="stat"><span>Not published</span><strong>${draftCount}</strong></div>
    </div>
    <div class="tabs" role="tablist" aria-label="Volunteer views">
      ${[['schedule', 'Schedule'], ['signups', 'Sign-ups'], ['checkin', 'Event-day check-in']].map(([k, l]) => html`<button role="tab" type="button" class="tab" id="tab-${k}" aria-selected="${tab === k}" aria-controls="tabpanel" data-tab="${k}">${l}</button>`)}
    </div>`;

  let panel;
  if (tab === 'signups') {
    const list = active.filter((v) => !q || `${v.name} ${v.email} ${v.group_name || ''}`.toLowerCase().includes(q.toLowerCase()));
    panel = html`<div class="button-row"><button class="button button--outline" id="export-list">Export sign-up list (Excel)</button></div>
      ${field({ label: 'Search', name: 'q', type: 'search', value: q, id: 'vq' })}
      ${table(list, [
        { label: 'Name', cell: (v) => html`${v.name}${v.is_adult ? '' : html` ${badge('pending', 'Under 18')}`}${v.returning_volunteer ? html` ${badge('ok', 'Returning')}` : ''}` },
        { label: 'Contact', cell: (v) => html`${v.email}<br><small>${v.phone || ''}</small>` },
        { label: 'Preferences', cell: (v) => (v.preferences || []).map((p) => PREF[p]?.split(' (')[0] || p).join(', ') },
        { label: 'Available', cell: (v) => ({ all_day: 'All day', morning: 'Morning', afternoon: 'Afternoon' }[v.availability]) },
        { label: 'Group', cell: (v) => v.group_name || '—' },
        { label: 'Shifts', cell: (v) => shiftsOf(v.id).map((s) => s?.label).join(', ') || '—' },
      ], { caption: `Volunteers for ${city.name}`, empty: 'No sign-ups yet.' })}`;
  } else if (tab === 'checkin') {
    const rows = asg.map((a) => ({ a, s: shifts.find((s) => s.id === a.shift_id), v: vById[a.volunteer_id] })).sort((x, y) => (x.s.start_min ?? 0) - (y.s.start_min ?? 0));
    panel = html`<p>Tap <strong>Check in</strong> when a volunteer arrives at ${city.checkin_location || 'the Information Table'}.</p>
      ${table(rows, [
        { label: 'Volunteer', cell: (r) => html`${r.v?.name}<br><small>${r.v?.phone || ''}</small>` },
        { label: 'Shift', cell: (r) => html`${r.s.label}<br><small>${R.clock(r.s.start_min)}–${R.clock(r.s.end_min)} · ${r.s.zone}</small>` },
        { label: 'Status', cell: (r) => (r.a.checked_out_at ? badge('ok', `Out ${R.dateTime(r.a.checked_out_at).split(', ').pop()}`) : r.a.checked_in_at ? badge('checked_in', `In ${R.dateTime(r.a.checked_in_at).split(', ').pop()}`) : badge(r.a.status)) },
        { label: 'Action', cell: (r) => (!r.a.checked_in_at ? html`<button class="button button--primary button--small" data-in="${r.a.id}">Check in<span class="sr-only"> ${r.v?.name}</span></button>`
          : !r.a.checked_out_at ? html`<button class="button button--outline button--small" data-out="${r.a.id}">Check out<span class="sr-only"> ${r.v?.name}</span></button>` : '') },
      ], { caption: 'Check-in', empty: 'No one is scheduled yet.' })}`;
  } else {
    const zones = [...new Set(shifts.map((s) => s.zone))];
    const volOpts = (current) => [['', '— Empty —'], ...active.map((v) => [v.id, `${v.name}${v.id !== current && shiftsOf(v.id).length ? ` (${shiftsOf(v.id).length} shift${shiftsOf(v.id).length > 1 ? 's' : ''})` : ''}`])];
    panel = html`<div class="button-row">
        <button class="button button--primary" id="auto">Auto-schedule</button>
        <button class="button button--dark" id="publish" ${draftCount ? '' : raw('disabled')}>Publish and email volunteers${draftCount ? ` (${draftCount})` : ''}</button>
        <button class="button button--outline" id="export-sched">Export schedule (2026 layout)</button></div>
      <p class="hint">Auto-schedule fills empty shifts using each person’s preferences and availability, returning volunteers first, keeps groups together, and never double-books. Locked shifts and published shifts are kept. Zone Leads, hired guards and first aid are assigned by hand.</p>
      ${zones.map((z) => html`<h2 class="h4 zone-title">${z}</h2>${table(shifts.filter((s) => s.zone === z), [
        { label: 'Shift', cell: (s) => html`${s.label}${s.admin_only ? html` ${badge('neutral', 'By hand')}` : ''}<br><small class="muted">${R.clock(s.start_min)}–${R.clock(s.end_min)}${s.duties ? ` · ${s.duties}` : ''}</small>` },
        { label: 'Volunteer', cell: (s) => { const a = asg.find((x) => x.shift_id === s.id); return html`<label class="sr-only" for="sv-${s.id}">Volunteer for ${s.label}</label><select id="sv-${s.id}" data-shift="${s.id}">${volOpts(a?.volunteer_id).map(([v, t]) => html`<option value="${v}" ${v === (a?.volunteer_id || '') ? raw('selected') : ''}>${t}</option>`)}</select>`; } },
        { label: 'Status', cell: (s) => { const a = asg.find((x) => x.shift_id === s.id); return a ? badge(a.status) : badge('missing', 'Empty'); } },
        { label: 'Lock', cell: (s) => { const a = asg.find((x) => x.shift_id === s.id); return a ? html`<label class="check check--inline"><input type="checkbox" data-lock="${a.id}" ${a.locked ? raw('checked') : ''}><span>Locked<span class="sr-only"> ${s.label}</span></span></label>` : ''; } },
      ], { caption: `${z} shifts` })}`)}`;
  }
  ctx.show(html`${head}<div id="tabpanel" role="tabpanel" aria-labelledby="tab-${tab}">${panel}</div>`, 'Volunteers');

  $('#vcity').addEventListener('change', (e) => { cityId = e.target.value; volunteers(); });
  $('#vq')?.addEventListener('input', (e) => { q = e.target.value; clearTimeout(volunteers.t); volunteers.t = setTimeout(() => volunteers().then(() => { const el = $('#vq'); el.focus(); el.setSelectionRange(q.length, q.length); }), 300); });
  ctx.view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; return volunteers().then(() => $(`#tab-${tab}`)?.focus()); }
    try {
      if (b.dataset.in) { await api.update('assignments', { id: b.dataset.in }, { checked_in_at: new Date().toISOString() }); return volunteers(); }
      if (b.dataset.out) { await api.update('assignments', { id: b.dataset.out }, { checked_out_at: new Date().toISOString() }); return volunteers(); }
      if (b.id === 'auto') {
        return busy(b, async () => {
          const existing = [...asg.map((a) => ({ ...a, locked: a.locked || a.status !== 'draft' })), ...declines.filter((d) => shiftIds.has(d.shift_id)).map((d) => ({ ...d, status: 'declined' }))];
          const res = R.autoSchedule(shifts, active, existing);
          const n = await api.rpc('save_schedule', { p_city: cityId, p_assignments: res.assignments });
          toast(`Draft schedule ready: ${n} shifts filled, ${res.unfilled.length} still empty, ${res.unplaced.length} volunteers without a shift. Check it, then Publish.`);
          volunteers();
        });
      }
      if (b.id === 'publish') {
        if (!(await confirmDialog('Publish schedule', `Publish ${draftCount} draft shifts for ${city.name} and email each volunteer their shift with a private confirm / decline link?`, { submit: 'Publish and email' }))) return;
        return busy(b, async () => { const r = await api.fn('mailer', { action: 'publish_schedule', city_id: cityId }); toast(`Published. ${r?.emailed ?? 0} volunteers emailed.`); volunteers(); });
      }
      if (b.id === 'export-sched') return busy(b, async () => { const { exportSchedule } = await import('../lib/excel.js'); await exportSchedule(city, shifts, asg, vols, ctx.ref.settings.event?.year); });
      if (b.id === 'export-list') return busy(b, async () => { const { exportVolunteerList } = await import('../lib/excel.js'); await exportVolunteerList(city, active, PREF, ctx.ref.settings.event?.year); });
    } catch (ex) { showError(ex); }
  };
  ctx.view.onchange = async (e) => {
    try {
      const lock = e.target.closest('[data-lock]');
      if (lock) { await api.update('assignments', { id: lock.dataset.lock }, { locked: lock.checked }); return toast(lock.checked ? 'Locked – auto-schedule won’t change it.' : 'Unlocked.'); }
      const sel = e.target.closest('[data-shift]');
      if (!sel) return;
      const s = shifts.find((x) => x.id === sel.dataset.shift);
      const a = asg.find((x) => x.shift_id === s.id);
      if (!sel.value) { if (a) await api.remove('assignments', { id: a.id }); toast('Shift emptied.'); return volunteers(); }
      const clash = shiftsOf(sel.value).filter((o) => o && o.id !== s.id && o.start_min < s.end_min && s.start_min < o.end_min);
      if (clash.length && !(await confirmDialog('Double-booked', `${vById[sel.value].name} already has ${clash.map((c) => c.label).join(', ')} at the same time. Assign anyway?`, { submit: 'Assign anyway' }))) return volunteers();
      if (a) await api.update('assignments', { id: a.id }, { volunteer_id: sel.value, status: 'draft', locked: true, notified_at: null, checked_in_at: null, checked_out_at: null });
      else await api.insert('assignments', { shift_id: s.id, volunteer_id: sel.value, status: 'draft', locked: true });
      toast('Saved as a locked draft. Publish to email the volunteer.');
      volunteers();
    } catch (ex) { showError(ex); volunteers(); }
  };
}
