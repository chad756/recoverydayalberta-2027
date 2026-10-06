// Public volunteer sign-up form (no account needed).
import '../main.js';
import '../styles/app.css';
import { api, isDemo } from '../lib/api.js';
import { $, html, raw, setHTML, field, link } from '../lib/ui.js';
import { R } from '../lib/data.js';

const box = $('#volunteer-signup');

async function start() {
  let cities = [];
  try { cities = (await api.list('cities', { order: 'sort' })).filter((c) => c.active !== false); } catch { /* shown below */ }
  if (!cities.length) { setHTML(box, html`<p class="notice">The sign-up form isn’t available right now. Please email <a href="mailto:community@lastdoor.org">community@lastdoor.org</a>.</p>`); return; }
  const cb = (name, value, label, extra = '') => html`<label class="check"><input type="checkbox" name="${name}" value="${value}" ${raw(extra)}><span>${label}</span></label>`;
  setHTML(box, html`${isDemo ? html`<p class="demo-banner">Demo: sign-ups are saved only in this browser tab.</p>` : ''}
  <form id="vform" class="stack" novalidate>
    <p class="hint">Fields marked * are required.</p>
    <fieldset><legend>Where would you like to help? *</legend><div class="city-pick">
      ${cities.map((c) => cb('cities', c.id, html`<strong>${c.name}</strong> <small>${c.event_date ? R.longDate(c.event_date) : 'Date to be announced'}</small>`))}</div></fieldset>
    <fieldset><legend>About you</legend>
      ${field({ label: 'Full name *', name: 'name', required: true, attrs: 'autocomplete="name" maxlength="120"' })}
      <div class="field-row">${field({ label: 'Email *', name: 'email', type: 'email', required: true, attrs: 'autocomplete="email" maxlength="200"' })}
      ${field({ label: 'Phone *', name: 'phone', type: 'tel', required: true, attrs: 'autocomplete="tel" maxlength="30"' })}</div>
      <fieldset class="radio-group"><legend>Age *</legend>
        <label class="radio"><input type="radio" name="age" value="adult" required><span>18 or older</span></label>
        <label class="radio"><input type="radio" name="age" value="teen"><span>14 to 17</span></label>
        <label class="radio"><input type="radio" name="age" value="child"><span>Under 14</span></label></fieldset>
      <div id="guardian" hidden class="card"><p>Volunteers under 18 need a parent or guardian’s permission.</p>
        ${field({ label: 'Parent or guardian name *', name: 'guardian_name', attrs: 'maxlength="120"' })}
        ${field({ label: 'Parent or guardian phone or email *', name: 'guardian_contact', attrs: 'maxlength="200"' })}
        ${cb('guardian_consent', 'yes', 'I am the parent or guardian (or they are with me) and I give permission for this young person to volunteer. *')}</div>
      <p id="under14" class="notice" hidden>Volunteers under 14 can’t sign up on their own. A parent or guardian can email <a href="mailto:community@lastdoor.org">community@lastdoor.org</a> to volunteer together as a family.</p>
    </fieldset>
    <fieldset><legend>What would you like to do? (choose any)</legend><div class="check-grid">
      ${R.VOLUNTEER_PREFERENCES.map((p) => cb('preferences', p.key, p.label))}</div></fieldset>
    ${field({ label: 'When are you available?', name: 'availability', type: 'select', value: 'all_day', options: [['all_day', 'All day'], ['morning', 'Morning only'], ['afternoon', 'Afternoon only']] })}
    <fieldset><legend>Experience</legend>
      ${cb('returning', 'yes', 'I volunteered at Recovery Day before')}
      ${cb('other_festivals', 'yes', 'I have volunteered at other festivals or events')}
      ${field({ label: 'Anything we should know about your experience or skills?', name: 'experience', type: 'textarea', attrs: 'maxlength="1000"' })}</fieldset>
    <fieldset><legend>Volunteering with a group?</legend><div class="field-row">
      ${field({ label: 'Group name (we’ll try to keep you together)', name: 'group_name', attrs: 'maxlength="120"' })}
      ${field({ label: 'Group size', name: 'group_size', type: 'number', attrs: 'min="2" max="50"' })}</div></fieldset>
    <fieldset><legend>Day-of details</legend><div class="field-row">
      ${field({ label: 'T-shirt size', name: 'tshirt_size', type: 'select', options: [['', 'Choose…'], ...['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((s) => [s, s])] })}</div>
      <div class="field-row">${field({ label: 'Emergency contact name *', name: 'emergency_name', required: true, attrs: 'maxlength="120"' })}
      ${field({ label: 'Emergency contact phone *', name: 'emergency_phone', type: 'tel', required: true, attrs: 'maxlength="30"' })}</div>
      ${field({ label: 'Accessibility needs or anything that would help you volunteer comfortably (optional)', name: 'accessibility', type: 'textarea', attrs: 'maxlength="1000"' })}</fieldset>
    <fieldset><legend>Permissions</legend>
      ${cb('comms_consent', 'yes', 'Yes, The Last Door Recovery Society may contact me by email, text or phone about my volunteer sign-up and shifts. *', 'required')}
      ${cb('media_consent', 'yes', 'I agree that photos or video of me taken at the event may be used to promote Recovery Day.')}
      ${cb('marketing_opt_in', 'yes', 'Send me news about future Recovery Day events. (You can unsubscribe at any time.)')}
      <p class="hint">Read our <a href="${link('privacy/')}">privacy policy</a> to see how we use and protect your information.</p></fieldset>
    <p class="form-error" role="alert" hidden></p>
    <button class="button button--primary" type="submit">Sign up</button>
  </form>`);

  const f = $('#vform');
  const err = f.querySelector('.form-error');
  f.addEventListener('change', () => {
    const age = f.querySelector('[name=age]:checked')?.value;
    $('#guardian').hidden = age !== 'teen';
    $('#under14').hidden = age !== 'child';
    f.querySelector('[type=submit]').disabled = age === 'child';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const all = (n) => [...f.querySelectorAll(`[name=${n}]:checked`)].map((x) => x.value);
    const age = f.querySelector('[name=age]:checked')?.value;
    const problems = [];
    if (!all('cities').length) problems.push('choose at least one city');
    for (const n of ['name', 'email', 'phone', 'emergency_name', 'emergency_phone']) if (!f[n].value.trim()) problems.push(`fill in “${f.querySelector(`label[for="${f[n].id}"]`).textContent.replace(' *', '')}”`);
    if (f.email.value && !f.email.checkValidity()) problems.push('check the email address');
    if (!age) problems.push('choose your age group');
    if (age === 'teen' && !(f.guardian_name.value.trim() && f.guardian_contact.value.trim() && f.guardian_consent.checked)) problems.push('add parent or guardian details and permission');
    if (!f.comms_consent.checked) problems.push('agree that we may contact you about your shifts');
    if (problems.length) { err.textContent = `Please ${problems.join(', ')}.`; err.hidden = false; err.focus?.(); err.scrollIntoView({ block: 'center' }); return; }
    const btn = e.submitter; btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const p = { name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), cities: all('cities'), is_adult: age === 'adult', age_14_plus: age !== 'child',
        guardian_name: f.guardian_name.value, guardian_contact: f.guardian_contact.value, guardian_consent: f.guardian_consent.checked,
        preferences: all('preferences'), availability: f.availability.value, experience: f.experience.value, returning: f.returning.checked, other_festivals: f.other_festivals.checked,
        group_name: f.group_name.value, group_size: f.group_size.value, tshirt_size: f.tshirt_size.value, emergency_name: f.emergency_name.value, emergency_phone: f.emergency_phone.value,
        accessibility: f.accessibility.value, comms_consent: true, media_consent: f.media_consent.checked, marketing_opt_in: f.marketing_opt_in.checked };
      const n = await api.rpc('volunteer_signup', { p });
      const names = cities.filter((c) => p.cities.includes(c.id)).map((c) => c.name).join(' and ');
      setHTML(box, html`<div class="notice notice--ok" role="status" tabindex="-1" id="thanks"><h3>Thank you, ${p.name.split(' ')[0]}.</h3>
        <p>You’re signed up to volunteer in ${names}${n > 1 ? ` (${n} sign-ups)` : ''}. About two weeks before the event we’ll email your shift to <strong>${p.email}</strong> with a link to confirm it.</p></div>`);
      $('#thanks').focus();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Sign up'; }
  });
}
start();
