// =============================================================================
// Shared JavaScript for every page: styles, mobile menu and poster pop-up.
// =============================================================================

import '@fontsource-variable/inter';
import './styles/main.css';

// ---- Mobile menu ------------------------------------------------------------
function setupMenu() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('site-menu');
  if (!toggle || !menu) return;

  const label = toggle.querySelector('.nav-toggle__label');
  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Close' : 'Menu';
  };

  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

// ---- Poster pop-up (uses the built-in <dialog>, which handles focus + Esc) --
function setupPosterDialog() {
  const dialog = document.getElementById('poster-dialog');
  const image = document.getElementById('poster-dialog-image');
  if (!dialog || !image || typeof dialog.showModal !== 'function') return;

  document.querySelectorAll('.poster-trigger[data-poster]').forEach((button) => {
    button.addEventListener('click', () => {
      image.src = button.dataset.poster;
      image.alt = button.dataset.posterAlt || '';
      dialog.showModal();
    });
  });

  dialog.querySelectorAll('[data-close-dialog]').forEach((btn) =>
    btn.addEventListener('click', () => dialog.close()),
  );
  // Click outside the poster closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

setupMenu();
setupPosterDialog();
