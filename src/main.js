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

// ---- Home page photo slideshow ---------------------------------------------
// Fades to the next photo every 6 seconds. Has a Pause button (an accessibility
// requirement for anything that moves on its own), stops when the tab is
// hidden, and doesn't move at all for visitors who prefer reduced motion.
function setupSlideshow() {
  const box = document.querySelector('[data-slideshow]');
  if (!box) return;
  const slides = [...box.querySelectorAll('.hero__slide')];
  const toggle = document.querySelector('[data-slideshow-toggle]');
  if (slides.length < 2) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const INTERVAL = 6000;
  let index = 0;
  let timer = null;
  let paused = reduce.matches;

  const load = (img) => {
    if (img && img.dataset.srcset) {
      img.srcset = img.dataset.srcset;
      img.removeAttribute('data-srcset');
    }
  };
  load(slides[1]); // get the next photo ready

  const show = (n) => {
    slides[index].classList.remove('is-active');
    index = (n + slides.length) % slides.length;
    load(slides[index]);
    slides[index].classList.add('is-active');
    load(slides[(index + 1) % slides.length]);
  };
  const next = () => {
    const img = slides[(index + 1) % slides.length];
    // Wait for the photo to finish loading so it never fades in half-drawn.
    if (img.complete && img.naturalWidth) show(index + 1);
    else img.addEventListener('load', () => show(index + 1), { once: true });
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => { stop(); if (!paused) timer = setInterval(next, INTERVAL); };
  const render = () => {
    if (!toggle) return;
    toggle.classList.toggle('is-paused', paused);
    toggle.querySelector('.hero__pause-text').textContent = paused ? 'Play slideshow' : 'Pause slideshow';
  };

  toggle?.addEventListener('click', () => {
    paused = !paused;
    if (!paused) next();
    render();
    start();
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  render();
  start();
}

// ---- Sponsor logo banner ----------------------------------------------------
// The scrolling itself is pure CSS; this sets the speed and runs the Pause button.
function setupLogoStrip() {
  const strip = document.querySelector('[data-logo-strip]');
  if (!strip) return;
  const seconds = Number(strip.dataset.seconds) || 60;
  strip.style.setProperty('--logo-seconds', `${seconds}s`);
  const toggle = strip.querySelector('[data-logo-strip-toggle]');
  toggle?.addEventListener('click', () => {
    const paused = strip.classList.toggle('is-paused');
    toggle.classList.toggle('is-paused', paused);
    toggle.querySelector('.logo-strip__pause-text').textContent = paused ? 'Play logos' : 'Pause logos';
  });
}

setupMenu();
setupPosterDialog();
setupSlideshow();
setupLogoStrip();
