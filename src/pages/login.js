// Login page (placeholder until Phase 2/3).
// Reads ?next=apply so that, later, a vendor lands on the application after
// logging in. For now it just shows a friendly message.

import '../main.js';

const ALLOWED_NEXT = { apply: 'Once you log in, you’ll go straight to the vendor / sponsor application.' };

const next = new URLSearchParams(window.location.search).get('next');
const box = document.getElementById('login-next');

// Only known values are used (never echo the raw URL value onto the page).
if (box && next && Object.hasOwn(ALLOWED_NEXT, next)) {
  box.textContent = ALLOWED_NEXT[next];
  box.hidden = false;
}
