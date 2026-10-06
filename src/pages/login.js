// =============================================================================
// Login page: sign in · create account · forgot / reset password · two-factor
// =============================================================================
// ?next=apply  → after login, open the application form
// ?next=admin  → after login, open the admin portal
// ?mfa=1       → staff: set up or enter the authenticator code
// Staff (Admin, Finance, Super Admin) must use two-factor sign-in.
// =============================================================================
import '../main.js';
import '../styles/app.css';
import { api, isDemo, isConfigured } from '../lib/api.js';
import { $, html, link, setHTML, showError, busy, field, toast } from '../lib/ui.js';
import { loadMe, STAFF_ROLES, demoBanner } from '../lib/session.js';

const app = $('#app');
const title = $('#page-title');
const params = new URLSearchParams(location.search);
const NEXT = { apply: 'portal/#/apply', admin: 'admin/', portal: 'portal/' };
const nextKey = Object.hasOwn(NEXT, params.get('next') || '') ? params.get('next') : null;
const MIN_PASSWORD = 12;

function goAfterLogin(profile) {
  if (STAFF_ROLES.includes(profile?.role)) return location.assign(link('admin/'));
  const target = nextKey && nextKey !== 'admin' ? NEXT[nextKey] : 'portal/';
  const [page, hash] = target.split('#');
  location.assign(link(page, hash ? `#${hash}` : ''));
}

function view(name, heading, content) {
  title.textContent = heading;
  document.title = `${heading} | Recovery Day Alberta`;
  setHTML(app, content);
  app.dataset.view = name;
  app.querySelector('input')?.focus();
}

function passwordRules() {
  return html`<p class="hint" id="pw-rules">At least ${MIN_PASSWORD} characters. A short sentence works well, for example “sunny-calgary-festival-2027”.</p>`;
}

// ---- Views ------------------------------------------------------------------
function signInView(message = '') {
  view('signin', 'Log in', html`
    ${message ? html`<p class="notice notice--ok" role="status">${message}</p>` : ''}
    ${nextKey === 'apply' ? html`<p class="notice" role="status">Log in or create a free account to start your vendor / sponsor application.</p>` : ''}
    ${params.get('disabled') ? html`<p class="notice notice--error" role="alert">This account is disabled. Please contact community@lastdoor.org.</p>` : ''}
    <form id="signin" class="stack" novalidate>
      ${field({ label: 'Email', name: 'email', type: 'email', required: true, attrs: 'autocomplete="email"' })}
      ${field({ label: 'Password', name: 'password', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
      <p class="form-error" role="alert" hidden></p>
      <button class="button button--primary" type="submit">Log in</button>
    </form>
    <p class="auth-links"><a href="#" data-go="forgot">Forgot your password?</a></p>
    <hr>
    <h2 class="h3">New here?</h2>
    <p>Create a free account to apply for a booth or sponsorship and see your invoices.</p>
    <button class="button button--outline" type="button" data-go="signup">Create an account</button>`);
  $('#signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector('.form-error');
    err.hidden = true;
    if (!f.checkValidity()) { err.hidden = false; err.textContent = 'Please enter your email and password.'; return; }
    await busy(f.querySelector('button'), async () => {
      try {
        await api.auth.signIn(f.email.value.trim(), f.password.value);
        const me = await loadMe();
        if (STAFF_ROLES.includes(me?.profile?.role)) return mfaView(me);
        goAfterLogin(me?.profile);
      } catch (ex) { err.hidden = false; err.textContent = ex.message; }
    });
  });
}

function signUpView() {
  view('signup', 'Create an account', html`
    <form id="signup" class="stack" novalidate>
      ${field({ label: 'Your name', name: 'name', required: true, attrs: 'autocomplete="name" maxlength="120"' })}
      ${field({ label: 'Email', name: 'email', type: 'email', required: true, attrs: 'autocomplete="email"' })}
      <div class="field"><label for="pw1">Password<span aria-hidden="true"> *</span></label>${passwordRules()}
        <input id="pw1" name="password" type="password" required minlength="${MIN_PASSWORD}" autocomplete="new-password" aria-describedby="pw-rules"></div>
      ${field({ label: 'Type the password again', name: 'password2', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}
      <p class="hint">By creating an account you agree that we can use your contact details to manage your application. See our <a href="${link('privacy/')}">privacy policy</a>.</p>
      <p class="form-error" role="alert" hidden></p>
      <button class="button button--primary" type="submit">Create account</button>
    </form>
    <p class="auth-links"><a href="#" data-go="signin">I already have an account</a></p>`);
  $('#signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector('.form-error');
    const fail = (m) => { err.hidden = false; err.textContent = m; };
    err.hidden = true;
    if (!f.name.value.trim() || !f.email.checkValidity() || !f.email.value) return fail('Please enter your name and a valid email.');
    if (f.password.value.length < MIN_PASSWORD) return fail(`Your password needs at least ${MIN_PASSWORD} characters.`);
    if (f.password.value !== f.password2.value) return fail('The two passwords don’t match.');
    await busy(f.querySelector('button'), async () => {
      try {
        const redirect = new URL(link('login/', nextKey ? `?next=${nextKey}` : ''), location.href).href;
        await api.auth.signUp(f.email.value.trim(), f.password.value, f.name.value.trim(), redirect);
        view('check-email', 'Check your email', html`
          <p class="notice notice--ok" role="status">We sent a confirmation link to <strong>${f.email.value.trim()}</strong>.</p>
          <p>Open the email and click the link to finish creating your account. Then come back here and log in.</p>
          <p class="hint">No email after 5 minutes? Check your junk folder, or email community@lastdoor.org.</p>
          <button class="button button--outline" type="button" data-go="signin">Back to log in</button>`);
      } catch (ex) { fail(ex.message); }
    });
  });
}

function forgotView() {
  view('forgot', 'Reset your password', html`
    <form id="forgot" class="stack" novalidate>
      <p>Enter your email. We’ll send you a link to choose a new password.</p>
      ${field({ label: 'Email', name: 'email', type: 'email', required: true, attrs: 'autocomplete="email"' })}
      <button class="button button--primary" type="submit">Send reset link</button>
    </form>
    <p class="auth-links"><a href="#" data-go="signin">Back to log in</a></p>`);
  $('#forgot').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    if (!email) return;
    await busy(e.target.querySelector('button'), async () => {
      await api.auth.sendReset(email, new URL(link('login/', '?reset=1'), location.href).href);
      // Same message whether or not the account exists (privacy).
      setHTML(app, html`<p class="notice notice--ok" role="status">If an account exists for ${email}, a reset link is on its way.</p>
        <button class="button button--outline" type="button" data-go="signin">Back to log in</button>`);
    });
  });
}

function newPasswordView() {
  view('reset', 'Choose a new password', html`
    <form id="reset" class="stack" novalidate>
      <div class="field"><label for="np1">New password<span aria-hidden="true"> *</span></label>${passwordRules()}
        <input id="np1" name="password" type="password" required minlength="${MIN_PASSWORD}" autocomplete="new-password" aria-describedby="pw-rules"></div>
      ${field({ label: 'Type it again', name: 'password2', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}
      <p class="form-error" role="alert" hidden></p>
      <button class="button button--primary" type="submit">Save new password</button>
    </form>`);
  $('#reset').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector('.form-error');
    if (f.password.value.length < MIN_PASSWORD || f.password.value !== f.password2.value) {
      err.hidden = false; err.textContent = `Use at least ${MIN_PASSWORD} characters, typed the same twice.`; return;
    }
    await busy(f.querySelector('button'), async () => {
      await api.auth.updatePassword(f.password.value);
      await api.auth.signOut();
      signInView('Your password was changed. Please log in.');
    });
  });
}

/** Staff two-factor: set up the authenticator app the first time, then enter codes. */
async function mfaView(me) {
  const factors = (await api.auth.factors()).filter((f) => f.status === 'verified');
  if (factors.length) {
    view('mfa', 'Two-factor sign-in', html`
      <p>Open your authenticator app (for example Microsoft Authenticator or Google Authenticator) and type the 6-digit code for Recovery Day Alberta.</p>
      <form id="mfa" class="stack" novalidate>
        ${field({ label: '6-digit code', name: 'code', required: true, attrs: 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"' })}
        <p class="form-error" role="alert" hidden></p>
        <button class="button button--primary" type="submit">Continue</button>
      </form>
      <p class="hint">Lost your phone? Ask a Super Admin to reset your two-factor sign-in.</p>`);
    $('#mfa').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = e.target.querySelector('.form-error');
      await busy(e.target.querySelector('button'), async () => {
        try { await api.auth.verify(factors[0].id, e.target.code.value.trim()); goAfterLogin(me.profile); } catch (ex) { err.hidden = false; err.textContent = ex.message; }
      });
    });
    return;
  }
  const f = await api.auth.enroll();
  view('mfa-setup', 'Set up two-factor sign-in', html`
    <p>Staff accounts need a second step when logging in. You only set this up once.</p>
    <ol class="steps">
      <li>Install <strong>Microsoft Authenticator</strong> or <strong>Google Authenticator</strong> on your phone.</li>
      <li>In the app, tap <strong>+</strong> → <strong>Scan a QR code</strong>, and scan this code:
        <img class="qr" src="${f.qr}" alt="QR code for your authenticator app" width="200" height="200">
        <span class="hint">Can’t scan? Choose “Enter a setup key” and type: <code>${f.secret}</code></span></li>
      <li>Type the 6-digit code the app shows:</li>
    </ol>
    <form id="mfa-setup" class="stack" novalidate>
      ${field({ label: '6-digit code', name: 'code', required: true, attrs: 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"' })}
      <p class="form-error" role="alert" hidden></p>
      <button class="button button--primary" type="submit">Turn on two-factor</button>
    </form>`);
  $('#mfa-setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = e.target.querySelector('.form-error');
    await busy(e.target.querySelector('button'), async () => {
      try { await api.auth.verify(f.id, e.target.code.value.trim()); toast('Two-factor sign-in is on.'); goAfterLogin(me.profile); } catch (ex) { err.hidden = false; err.textContent = ex.message; }
    });
  });
}

function demoView() {
  view('demo', 'Log in', html`
    <p>In the real site this page has log in, create account, password reset and two-factor sign-in for staff. In this preview you can open either portal with a sample account:</p>
    <div class="demo-choices">
      <a class="choice-card" href="${link('portal/')}"><strong>Vendor / sponsor portal</strong><span>Signed in as “Jordan Demo” from Prairie Roots Wellness (sample)</span></a>
      <a class="choice-card" href="${link('portal/', '#/apply')}"><strong>Start a new application</strong><span>Try the step-by-step application form</span></a>
      <a class="choice-card" href="${link('admin/')}"><strong>Event admin portal</strong><span>Signed in as a sample Super Admin</span></a>
    </div>`);
}

// ---- Start ------------------------------------------------------------------
app.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  e.preventDefault();
  ({ signin: () => signInView(), signup: signUpView, forgot: forgotView })[go.dataset.go]?.();
});

(async () => {
  if (isDemo) { demoBanner(); return demoView(); }
  if (!isConfigured) {
    return setHTML(app, html`<p class="notice notice--error" role="alert">Log in isn’t available yet – the site isn’t connected to its database. Please email community@lastdoor.org.</p>`);
  }
  // Password-reset links land here with a temporary session.
  let recovering = params.get('reset') === '1' || /type=recovery/.test(location.hash);
  api.auth.onChange((event) => { if (event === 'PASSWORD_RECOVERY') { recovering = true; newPasswordView(); } });
  const me = await loadMe();
  if (recovering && me) return newPasswordView();
  if (me && STAFF_ROLES.includes(me.profile?.role)) {
    const aal = await api.auth.aal();
    if (aal.currentLevel !== 'aal2') return mfaView(me);
    if (!params.get('mfa')) return goAfterLogin(me.profile);
    return goAfterLogin(me.profile);
  }
  if (me) return goAfterLogin(me.profile);
  signInView(/type=signup|email_confirmed/.test(location.hash) ? 'Your email is confirmed. Please log in.' : '');
})().catch(showError);
