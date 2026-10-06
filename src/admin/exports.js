// Admin → Exports: sponsor master (2026 layout), volunteer lists and schedules.
import { api } from '../lib/api.js';
import { $, html, toast, busy, field } from '../lib/ui.js';
import { R } from '../lib/data.js';
import { ctx, ADMIN } from './context.js';

export default async function exportsPage() {
  const { ref } = ctx;
  const year = ref.settings.event?.year;
  ctx.show(html`<h1 class="h2">Exports</h1>
    <article class="card"><h2 class="h3">Sponsor master (.xlsx)</h2>
      <p>Same columns, same order and the same header text as the 2026 sheet (A–CD), with “Artisan $200” and the new columns CE–CL (mutual support, deposit, paid, owing, due date, refund). Includes the “Sponsor Emails” sheet. City blocks: AF–AV Calgary, AW–BM Red Deer, BN–CD Edmonton.</p>
      <button class="button button--primary" id="sponsor">Download Sponsors-${year}.xlsx</button></article>
    ${ctx.can(...ADMIN) ? html`<article class="card"><h2 class="h3">Volunteers</h2>
      ${field({ label: 'City', name: 'city', type: 'select', options: ref.cities.map((c) => [c.id, c.name]), id: 'xcity' })}
      <div class="button-row"><button class="button button--outline" id="vlist">Sign-up list</button><button class="button button--outline" id="vsched">Schedule (2026 layout)</button></div></article>` : ''}
    <p class="hint">Exports contain personal information. Save them only on Last Door’s SharePoint, never on a personal computer or USB stick.</p>`, 'Exports');

  $('#sponsor').addEventListener('click', (e) => busy(e.target, async () => {
    const [orgs, apps, items, invoices, lines, payments, refunds, documents, booths] = await Promise.all([
      api.list('organizations'), api.list('applications'), api.list('application_items'), api.list('invoices'), api.list('invoice_lines'),
      api.list('payments'), api.list('refunds'), api.list('documents'), ctx.can(...ADMIN) ? api.list('booths') : [],
    ]);
    const { exportSponsorMaster } = await import('../lib/excel.js');
    const n = await exportSponsorMaster({ orgs, apps, items, invoices, lines, payments, refunds, documents, booths, settings: ref.settings }, year);
    toast(`Exported ${n} rows.`);
  }));
  const vol = async (kind, btn) => busy(btn, async () => {
    const city = ref.city($('#xcity').value);
    const [vols, shifts, asg] = await Promise.all([api.list('volunteers', { eq: { city_id: city.id } }), api.list('shifts', { eq: { city_id: city.id } }), api.list('assignments')]);
    const x = await import('../lib/excel.js');
    if (kind === 'list') await x.exportVolunteerList(city, vols.filter((v) => v.status === 'active'), Object.fromEntries(R.VOLUNTEER_PREFERENCES.map((p) => [p.key, p.label])), year);
    else await x.exportSchedule(city, shifts, asg.filter((a) => shifts.some((s) => s.id === a.shift_id)), vols, year);
  });
  $('#vlist')?.addEventListener('click', (e) => vol('list', e.target));
  $('#vsched')?.addEventListener('click', (e) => vol('sched', e.target));
}
