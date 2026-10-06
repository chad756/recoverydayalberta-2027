// Volunteer magic-link page: /volunteer/shifts/?t=<private token>
import '../main.js';
import '../styles/app.css';
import { api, isDemo } from '../lib/api.js';
import { $, html, setHTML, confirmDialog, toast, showError } from '../lib/ui.js';
import { R } from '../lib/data.js';

const box = $('#shifts');
let token = new URLSearchParams(location.search).get('t');

async function show() {
  if (!token && import.meta.env.VITE_DEMO === 'true') token = (await import('../demo/demo-backend.js')).demoVolunteerToken;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    setHTML(box, html`<p class="notice">Please open this page using the link in your shift email. Lost it? Email <a href="mailto:community@lastdoor.org">community@lastdoor.org</a>.</p>`); return;
  }
  // Remove the token from the address bar so it isn't shared by accident.
  if (!isDemo && location.search) history.replaceState(null, '', location.pathname);
  let d;
  try { d = await api.rpc('volunteer_portal', { p_token: token }); } catch (e) { d = null; showError(e); }
  if (!d) { setHTML(box, html`<p class="notice notice--error">This link isn’t valid any more. Please email <a href="mailto:community@lastdoor.org">community@lastdoor.org</a>.</p>`); return; }
  setHTML(box, html`${isDemo ? html`<p class="demo-banner">Demo: this is what a volunteer sees after clicking the link in their shift email.</p>` : ''}
    <p class="lead">Hi ${d.name}. Here ${d.shifts.length === 1 ? 'is your shift' : 'are your shifts'} for Recovery Day ${d.city}${d.event_date ? `, ${R.longDate(d.event_date)}` : ''}.</p>
    ${d.shifts.length ? d.shifts.map((s) => html`<article class="card shift-card">
      <h2 class="h3">${s.label}</h2>
      <p><strong>${R.clock(s.start_min)} – ${R.clock(s.end_min)}</strong> · ${s.zone}</p>
      ${s.duties ? html`<p>${s.duties}</p>` : ''}
      <p>${s.status === 'confirmed' ? html`<span class="badge badge--ok">Confirmed – thank you</span>` : html`<span class="badge badge--warn">Please confirm</span>`}</p>
      <div class="button-row">
        ${s.status !== 'confirmed' ? html`<button class="button button--primary" data-confirm="${s.id}">Confirm this shift</button>` : ''}
        <button class="button button--outline" data-decline="${s.id}">I can’t make it</button></div></article>`)
    : html`<p class="notice">You don’t have a shift right now. If you declined a shift, thank you for letting us know – we may contact you if another spot opens.</p>`}
    <h2 class="h3">On the day</h2>
    <ul><li>Check in at <strong>${d.checkin_location || 'the Information Table'}</strong> 10 minutes before your shift.</li>
      <li>Wear comfortable shoes and bring water, sunscreen and a layer for the weather.</li>
      <li>Questions? Email <a href="mailto:community@lastdoor.org">community@lastdoor.org</a>.</li></ul>`);
}

box.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const answer = b.dataset.confirm ? 'confirm' : 'decline';
  if (answer === 'decline' && !(await confirmDialog('Decline shift', 'Let us know you can’t make this shift? It will be offered to another volunteer.', { submit: 'Yes, decline' }))) return;
  try {
    b.disabled = true;
    await api.rpc('volunteer_respond', { p_token: token, p_assignment: b.dataset.confirm || b.dataset.decline, p_answer: answer });
    toast(answer === 'confirm' ? 'Thank you – your shift is confirmed.' : 'Thanks for letting us know.');
    show();
  } catch (ex) { b.disabled = false; showError(ex); }
});
show();
