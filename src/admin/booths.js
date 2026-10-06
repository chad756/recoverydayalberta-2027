// Admin → Booths & maps: upload a site map, click to drop booth pins, assign vendors, export.
import { api } from '../lib/api.js';
import { $, $$, html, raw, toast, showError, busy, formDialog, confirmDialog, table, field, setHTML, checkFile } from '../lib/ui.js';
import { R, itemLabel } from '../lib/data.js';
import { ctx } from './context.js';

const BOOTH_TYPES = [['health_retail', 'Health / Retail'], ['artisan', 'Artisan'], ['food_truck', 'Food truck'], ['non_profit', 'Non-profit'], ['sponsor', 'Sponsor'], ['other', 'Other']];
const typeLabel = (t) => BOOTH_TYPES.find(([k]) => k === t)?.[1] || '';
let cityId = null;
let placing = false;

export default async function booths() {
  const { ref } = ctx;
  cityId ||= ref.cities.find((c) => c.id === 'calgary')?.id || ref.cities[0]?.id;
  const city = ref.city(cityId);
  const [list, maps, apps, items, orgs] = await Promise.all([
    api.list('booths', { eq: { city_id: cityId }, order: 'label' }), api.list('site_maps', { eq: { city_id: cityId } }),
    api.list('applications', { eq: { status: 'accepted' } }), api.list('application_items', { eq: { city_id: cityId } }), api.list('organizations'),
  ]);
  const acceptedItems = items.filter((i) => apps.some((a) => a.id === i.application_id) && ref.product(i.product_code)?.kind !== 'rental');
  const orgOfItem = (it) => orgs.find((o) => o.id === apps.find((a) => a.id === it?.application_id)?.organization_id);
  const unplaced = acceptedItems.filter((i) => !list.some((b) => b.application_item_id === i.id));
  const map = maps[0];
  let mapUrl = null;
  if (map) { try { mapUrl = await api.signedUrl('site-maps', map.storage_path, 3600); } catch { /* none */ } }
  const itemOpts = (current) => [['', '— Empty —'], ...acceptedItems.filter((i) => i.id === current || !list.some((b) => b.application_item_id === i.id)).map((i) => [i.id, `${orgOfItem(i)?.legal_name} – ${itemLabel(i, ref).split(' – ')[0]}`])];

  ctx.show(html`<h1 class="h2">Booths &amp; site maps</h1>
    <div class="filters">${field({ label: 'City', name: 'city', type: 'select', value: cityId, options: ref.cities.map((c) => [c.id, c.name]), id: 'city-pick' })}</div>
    <div class="button-row">
      <label class="button button--outline file-button"><span>${map ? 'Replace site map' : 'Upload site map'}</span><input type="file" id="map-file" accept="image/png,image/jpeg"></label>
      ${mapUrl ? html`<button class="button ${placing ? 'button--dark' : 'button--primary'}" id="place" aria-pressed="${placing}">${placing ? 'Click the map to drop a pin… (press to stop)' : 'Add booths on the map'}</button>` : ''}
      <button class="button button--outline" id="add-manual">Add booth without the map</button>
      <button class="button button--outline" id="export">Export booth list (Excel)</button>
      <button class="button button--outline" id="print">Print booth list</button>
    </div>
    <p class="hint">Site maps: PNG or JPG up to 10 MB. If you have a PDF, open it and save or screenshot it as a PNG first.</p>
    ${mapUrl ? html`<figure class="site-map site-map--edit"><div class="site-map__frame ${placing ? 'is-placing' : ''}" id="map-frame">
        <img src="${mapUrl}" alt="Site map for ${city.name}" id="map-img">
        ${list.map((b) => html`<button type="button" class="pin ${b.application_item_id ? 'pin--taken' : ''}" data-x="${b.x_pct}" data-y="${b.y_pct}" data-booth="${b.id}"
          aria-label="Booth ${b.label}${b.application_item_id ? `, ${orgOfItem(acceptedItems.find((i) => i.id === b.application_item_id))?.legal_name ?? 'assigned'}` : ', empty'}">${b.label}</button>`)}
      </div><figcaption>Gold = assigned · White = empty. Click a pin to edit or assign it.</figcaption></figure>`
    : html`<p class="notice">No site map for ${city.name} yet. Upload one to place booths visually.</p>`}
    ${unplaced.length ? html`<p class="notice"><strong>${unplaced.length}</strong> accepted ${unplaced.length === 1 ? 'vendor has' : 'vendors have'} no booth yet: ${unplaced.map((i) => orgOfItem(i)?.legal_name).join(', ')}</p>` : ''}
    <h2 class="h3">Booth list – ${city.name}</h2>
    <div id="booth-table">${table(list, [
      { label: 'Booth', cell: (b) => b.label },
      { label: 'Zone', cell: (b) => b.zone || '—' },
      { label: 'Size', cell: (b) => b.size || '' },
      { label: 'Type', cell: (b) => typeLabel(b.booth_type) },
      { label: 'Vendor', cell: (b) => html`<label class="sr-only" for="as-${b.id}">Vendor for booth ${b.label}</label><select id="as-${b.id}" data-assign="${b.id}">${itemOpts(b.application_item_id).map(([v, t]) => html`<option value="${v}" ${v === (b.application_item_id || '') ? raw('selected') : ''}>${t}</option>`)}</select>` },
      { label: 'Edit', cell: (b) => html`<button class="button button--text" data-booth="${b.id}">Edit<span class="sr-only"> booth ${b.label}</span></button>` },
    ], { caption: `Booths in ${city.name}`, empty: 'No booths yet.' })}</div>`, 'Booths');

  $('#city-pick').addEventListener('change', (e) => { cityId = e.target.value; placing = false; booths(); });
  $('#map-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const problem = checkFile(file, { types: ['image/png', 'image/jpeg'] });
    if (problem) return showError(new Error(problem));
    try {
      const path = `${cityId}/map-${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
      await api.upload('site-maps', path, file);
      await api.upsert('site_maps', [{ city_id: cityId, storage_path: path, mime_type: file.type, updated_at: new Date().toISOString() }], 'city_id');
      if (map) api.removeFile('site-maps', map.storage_path).catch(() => {});
      toast('Site map uploaded.'); booths();
    } catch (ex) { showError(ex); }
  });
  $('#place')?.addEventListener('click', () => { placing = !placing; booths(); });
  $('#map-frame')?.addEventListener('click', async (e) => {
    if (e.target.closest('.pin') || !placing) return;
    const rect = $('#map-img').getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    await editBooth(null, { x, y, list, itemOpts });
  });
  $('#add-manual').addEventListener('click', () => editBooth(null, { x: 50, y: 50, list, itemOpts }));
  ctx.view.onclick = (e) => { const b = e.target.closest('[data-booth]'); if (b) editBooth(list.find((x) => x.id === b.dataset.booth), { list, itemOpts }); };
  ctx.view.onchange = async (e) => {
    const s = e.target.closest('[data-assign]');
    if (!s) return;
    try { await api.update('booths', { id: s.dataset.assign }, { application_item_id: s.value || null }); toast('Booth assignment saved. The vendor’s portal shows it now.'); booths(); } catch (ex) { showError(ex); booths(); }
  };
  const rowsForExport = () => list.map((b) => {
    const it = acceptedItems.find((i) => i.id === b.application_item_id); const o = orgOfItem(it);
    return { label: b.label, zone: b.zone || '', size: b.size || '', type: typeLabel(b.booth_type), org: o?.legal_name || '', contact: o?.contact_name || '', phone: o?.contact_phone || '',
      product: it ? itemLabel(it, ref).split(' – ')[0] : '', rentals: it && (it.tents || it.tables || it.chair_pairs) ? `Tents ${it.tents}, Tables ${it.tables}, Chairs ${it.chair_pairs * 2}` : '',
      power: it?.power_needed ? `Yes${it.power_amps ? ` (${it.power_amps} A)` : ''}` : '', notes: it?.special_requests || '' };
  });
  $('#export').addEventListener('click', (e) => busy(e.target, async () => { const { exportBoothList } = await import('../lib/excel.js'); await exportBoothList(city, rowsForExport(), ref.settings.event?.year); }));
  $('#print').addEventListener('click', () => {
    const rows = rowsForExport();
    const w = document.createElement('section');
    w.className = 'print-only';
    setHTML(w, html`<h1>Recovery Day ${city.name} – booth list</h1><p>${R.longDate(city.event_date)} · ${city.venue || ''}</p>
      <table class="data-table"><thead><tr><th>Booth</th><th>Zone</th><th>Organization</th><th>Contact</th><th>Type</th><th>Rentals</th><th>Power</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td>${r.label}</td><td>${r.zone}</td><td>${r.org}</td><td>${r.contact} ${r.phone}</td><td>${r.type}</td><td>${r.rentals}</td><td>${r.power}</td></tr>`)}</tbody></table>`);
    document.body.append(w);
    document.body.classList.add('is-printing');
    window.print();
    setTimeout(() => { w.remove(); document.body.classList.remove('is-printing'); }, 500);
  });
}

async function editBooth(b, { x, y, list, itemOpts }) {
  const next = b ? null : nextLabel(list);
  const v = await formDialog({ title: b ? `Booth ${b.label}` : 'New booth', submit: 'Save', body: html`
    <div class="field-row">
      ${field({ label: 'Booth number', name: 'label', value: b?.label ?? next, required: true, attrs: 'maxlength="20"' })}
      ${field({ label: 'Size', name: 'size', value: b?.size ?? '10x10', attrs: 'maxlength="20"' })}</div>
    <div class="field-row">
      ${field({ label: 'Type', name: 'booth_type', type: 'select', value: b?.booth_type ?? 'health_retail', options: BOOTH_TYPES })}
      ${field({ label: 'Zone', name: 'zone', value: b?.zone ?? '', attrs: 'maxlength="40"' })}</div>
    ${field({ label: 'Vendor', name: 'item', type: 'select', value: b?.application_item_id ?? '', options: itemOpts(b?.application_item_id) })}
    <div class="field-row">
      ${field({ label: 'Across (%)', name: 'x', type: 'number', value: b?.x_pct ?? x, attrs: 'min="0" max="100" step="0.1"', hint: '0 = left edge' })}
      ${field({ label: 'Down (%)', name: 'y', type: 'number', value: b?.y_pct ?? y, attrs: 'min="0" max="100" step="0.1"', hint: '0 = top edge' })}</div>
    ${b ? html`<p><label class="check"><input type="checkbox" name="delete"> <span>Delete this booth</span></label></p>` : ''}` });
  if (!v) return;
  try {
    if (v.delete) {
      if (await confirmDialog('Delete booth', `Delete booth ${b.label}?`, { submit: 'Delete', danger: true })) await api.remove('booths', { id: b.id });
    } else {
      const row = { city_id: cityId, label: v.label.trim(), size: v.size, booth_type: v.booth_type, zone: v.zone || null, application_item_id: v.item || null,
        x_pct: Math.min(100, Math.max(0, Number(v.x))), y_pct: Math.min(100, Math.max(0, Number(v.y))) };
      if (b) await api.update('booths', { id: b.id }, row); else await api.insert('booths', row);
    }
    toast('Saved.');
    booths();
  } catch (e) { showError(e); }
}

function nextLabel(list) {
  const nums = list.map((b) => b.label.match(/^(.*?)(\d+)$/)).filter(Boolean);
  if (!nums.length) return '1';
  const last = nums.sort((a, b) => Number(a[2]) - Number(b[2])).at(-1);
  return `${last[1]}${Number(last[2]) + 1}`;
}
