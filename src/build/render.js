// =============================================================================
// HTML RENDERERS (run at build time, not in the browser)
// =============================================================================
// The Vite plugin in src/build/html-plugin.js calls these functions to turn the
// data files (src/data/*.js) into plain HTML. Because the HTML is created when
// the site is built, search engines and people without JavaScript still see
// all of the festival content.
//
// You normally do NOT need to edit this file. To change text, edit the files in
// src/data/. Edit this file only to change the page layout (markup).
// =============================================================================

const TZ = 'America/Edmonton';

/** Escape text so it is always shown as text, never run as HTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** '2027-09-18' -> Date at noon Alberta time (safe from timezone shifts). */
function toDate(isoDate) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T12:00:00-06:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** '2027-09-18' -> 'Saturday, September 18' (or 'Date to be announced'). */
export function longDate(isoDate) {
  const d = toDate(isoDate);
  if (!d) return 'Date to be announced';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric',
  }).format(d);
}

/** '2027-09-18' -> 'Sept 18' (or 'Date TBA'). */
export function shortDate(isoDate) {
  const d = toDate(isoDate);
  if (!d) return 'Date TBA';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: 'short', day: 'numeric' })
    .format(d)
    .replace('.', '');
}

/** '14:00' -> '2:00 PM' */
export function time12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** '12:00','17:00' -> '12–5 PM' */
export function timeRange(start, end) {
  const s = time12(start).replace(':00', '');
  const e = time12(end).replace(':00', '');
  const [sNum, sSuf] = s.split(' ');
  const [eNum, eSuf] = e.split(' ');
  return sSuf === eSuf ? `${sNum}–${eNum} ${eSuf}` : `${s}–${e}`;
}

/** 5000 -> '$5,000' (CAD, whole dollars). */
export function money(amount) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount);
}

function timeTag(isoDate, text, hhmm) {
  if (!isoDate) return `<span class="time">${esc(text)}</span>`;
  const dt = hhmm ? `${isoDate}T${hhmm}` : isoDate;
  return `<time datetime="${esc(dt)}">${esc(text)}</time>`;
}

function mapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** External link: always opens in a new tab with rel="noopener noreferrer". */
function extLink(href, label, className = '') {
  const cls = className ? ` class="${className}"` : '';
  return `<a${cls} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> (opens in a new tab)</span></a>`;
}

// -----------------------------------------------------------------------------
// Page chrome
// -----------------------------------------------------------------------------

export function renderHeader({ base, current, navLinks, site }) {
  const links = navLinks
    .map((l) => {
      const isCurrent = l.key === current ? ' aria-current="page"' : '';
      return `<li><a href="${base}${l.href}"${isCurrent}>${esc(l.label)}</a></li>`;
    })
    .join('');
  return `
<a class="skip-link" href="#main-content">Skip to main content</a>
<header class="site-header">
  <nav class="site-nav" aria-label="Main">
    <div class="site-nav__inner">
      <a class="brand" href="${base}">
        <span>Recovery Day</span><strong>Alberta</strong>
        <span class="sr-only"> – home</span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-menu">
        <span class="nav-toggle__bars" aria-hidden="true"></span>
        <span class="nav-toggle__label">Menu</span>
      </button>
      <div class="site-menu" id="site-menu">
        <ul class="site-menu__links">${links}</ul>
        <a class="button button--primary button--small" href="${base}login/?next=apply">Apply to partner</a>
      </div>
    </div>
  </nav>
</header>`;
}

export function renderFooter({ base, festivals, site, year }) {
  const dates = festivals
    .map((f) => `${esc(f.city)} · ${esc(f.date ? longDate(f.date).split(', ')[1] : 'Date TBA')}`)
    .join('<br>');
  return `
<footer class="site-footer">
  <div class="container">
    <div class="site-footer__main">
      <div>
        <a class="brand brand--footer" href="${base}"><span>Recovery Day</span><strong>Alberta</strong></a>
        <p>Celebrating mental health and addiction recovery across Alberta.</p>
      </div>
      <div>
        <h2>${esc(year)} festivals</h2>
        <p>${dates}</p>
      </div>
      <div>
        <h2>Contact</h2>
        <p>
          <a href="mailto:${esc(site.email)}">${esc(site.email)}</a><br>
          <a href="tel:${esc(site.phoneLink)}">${esc(site.phoneDisplay)}</a>
        </p>
        <p>${extLink(site.facebook, 'Facebook')}</p>
      </div>
      <div>
        <h2>Partners</h2>
        <ul class="footer-links">
          <li><a href="${base}login/">Vendor / Sponsor login</a></li>
          <li><a href="${base}vendor-terms/">Vendor terms</a></li>
          <li><a href="${base}privacy/">Privacy</a></li>
        </ul>
      </div>
    </div>
    <div class="site-footer__bottom">
      <p>© ${esc(year)} ${esc(site.name)} · Presented by ${esc(site.organizer)}</p>
      <p>${esc(site.hashtag)}</p>
    </div>
  </div>
</footer>
<dialog class="poster-dialog" id="poster-dialog" aria-labelledby="poster-dialog-title">
  <div class="poster-dialog__panel">
    <h2 class="sr-only" id="poster-dialog-title">Festival poster</h2>
    <button class="poster-dialog__close" type="button" data-close-dialog>
      <span aria-hidden="true">×</span><span class="sr-only">Close poster</span>
    </button>
    <img id="poster-dialog-image" alt="" src="data:,">
  </div>
</dialog>`;
}

// -----------------------------------------------------------------------------
// Home page sections
// -----------------------------------------------------------------------------

export function renderHero({ base, festivals, year, heroPoster, highlightsStrip, site, heroSlides = [] }) {
  const dateLinks = festivals
    .map(
      (f) => `<li><a href="${base}schedules/#${esc(f.id)}-schedule">
        <strong>${esc(shortDate(f.date))}</strong><span>${esc(f.city)}</span></a></li>`,
    )
    .join('');
  const strip = highlightsStrip.map((h) => `<li>${esc(h)}</li>`).join('');
  // Slideshow: the first photo loads straight away, the rest are loaded by
  // src/main.js just before they're shown. Photos are decorative (alt="").
  const slides = heroSlides.map((file, i) => {
    const set = `${base}${esc(file)}-800.webp 800w, ${base}${esc(file)}-1600.webp 1600w`;
    return i === 0
      ? `<img class="hero__slide is-active" src="${base}${esc(file)}-1600.webp" srcset="${set}" sizes="100vw" alt="" width="1600" height="1067" fetchpriority="high">`
      : `<img class="hero__slide" data-srcset="${set}" sizes="100vw" alt="" width="1600" height="1067" decoding="async">`;
  }).join('\n      ');
  const slideshow = heroSlides.length ? `
  <div class="hero__slides" data-slideshow>
      ${slides}
  </div>
  <div class="hero__shade" aria-hidden="true"></div>` : '';
  const pause = heroSlides.length > 1 ? `
      <button class="hero__pause" type="button" data-slideshow-toggle>
        <span class="hero__pause-icon" aria-hidden="true"></span><span class="hero__pause-text">Pause slideshow</span>
      </button>` : '';
  return `
<section class="hero${heroSlides.length ? ' hero--photos' : ''}" aria-labelledby="hero-title">${slideshow}
  <div class="hero__inner container">
    <div class="hero__copy">
      <p class="kicker">Recovery Day Alberta ${esc(year)} · Free admission</p>
      <h1 id="hero-title">Three cities.<br><span>One movement.</span></h1>
      <p class="hero__lede">Edmonton, Calgary and Red Deer come together to celebrate mental health and addiction recovery.</p>
      <ul class="date-list" aria-label="${esc(year)} festival dates">${dateLinks}</ul>
      <div class="hero__actions">
        <a class="button button--primary" href="${base}schedules/">View the schedules</a>
        <a class="button button--ghost" href="${base}partner/">Partner with us</a>
      </div>
      <p class="hero__tagline">${(site.heroHashtags || [site.hashtag]).map((t) => `<span class="hashtag">${esc(t)}</span>`).join(' ')}</p>
    </div>
    ${heroSlides.length ? `<div class="hero__tools">${heroPoster ? `
      <button class="poster-trigger poster-trigger--link" type="button"
        data-poster="${base}${esc(heroPoster.fullImage)}" data-poster-alt="${esc(heroPoster.alt)}">View the poster</button>` : ''}${pause}
    </div>` : !heroPoster ? '' : `<div class="hero__art">
      <button class="poster-trigger" type="button"
        data-poster="${base}${esc(heroPoster.fullImage)}" data-poster-alt="${esc(heroPoster.alt)}">
        <img src="${base}${esc(heroPoster.image)}" alt="${esc(heroPoster.alt)}" width="1000" height="1294" fetchpriority="high">
        <span class="poster-trigger__label">View full poster</span>
      </button>
    </div>`}
  </div>
  <ul class="strip" aria-label="Festival highlights">${strip}</ul>
</section>`;
}

export function renderSchedules({ base, festivals, year, scheduleIntro, announcement = '', asPage = false }) {
  const H = asPage ? 'h1' : 'h2';
  const h = asPage ? 'h2' : 'h3';
  const jump = festivals
    .map((f) => `<li><a href="#${esc(f.id)}-schedule">${esc(f.city)} · ${esc(shortDate(f.date))}</a></li>`)
    .join('');
  const cards = festivals
    .map((f) => {
      const items = (f.schedule?.length ? f.schedule : [
        { time: f.startTime, title: 'Festival opens' },
        { time: '', title: announcement, tba: true },
        { time: f.endTime, title: 'Festival ends', end: true },
      ])
        .map((s) => {
          if (s.tba) return `<li class="is-tba"><span class="schedule__tba">To be announced</span><span class="schedule__title">${esc(s.title)}</span></li>`;
          const cls = s.featured ? ' class="is-featured"' : s.end ? ' class="is-end"' : '';
          return `<li${cls}>${timeTag(f.date, time12(s.time), s.time)}<span class="schedule__title">${esc(s.title)}</span></li>`;
        })
        .join('');
      return `
    <article class="schedule schedule--${esc(f.id)}" id="${esc(f.id)}-schedule" aria-labelledby="${esc(f.id)}-schedule-title">
      <header class="schedule__header">
        <p class="schedule__date">${timeTag(f.date, longDate(f.date))}</p>
        <${h} id="${esc(f.id)}-schedule-title">${esc(f.city)}</${h}>
        <p class="schedule__venue">${esc(f.venueShort)}</p>
      </header>
      <ol class="schedule__list" aria-label="${esc(f.city)} festival program">${items}</ol>
      <footer class="schedule__footer">
        ${extLink(mapsUrl(f.mapsQuery), `Get directions to ${esc(f.city)}`)}
      </footer>
    </article>`;
    })
    .join('');
  return `
<section class="section section--schedules" id="schedules" aria-labelledby="schedules-title">
  <div class="container">
    <div class="section-heading">
      <p class="eyebrow">${esc(year)} · Free admission</p>
      <${H} id="schedules-title">Festival schedules</${H}>
      <p>${esc(scheduleIntro)}</p>
      ${festivals.some((f) => !f.schedule?.length) && announcement ? `<p class="placeholder-note">${esc(announcement)}</p>` : ''}
    </div>
    <nav aria-label="Jump to a city schedule"><ul class="pill-links">${jump}</ul></nav>
    <div class="schedule-grid">${cards}</div>
  </div>
</section>`;
}

export function renderFestivals({ base, festivals, year, announcement = '' }) {
  const cards = festivals
    .map((f, i) => {
      const highlights = f.highlights.map((x) => `<li>${esc(x)}</li>`).join('');
      const supporting = f.supporting ? `<p class="city__supporting">${esc(f.supporting)}</p>` : '';
      const poster = f.poster
        ? `<button class="button button--text poster-trigger" type="button" data-poster="${base}${esc(f.poster)}" data-poster-alt="${esc(f.posterAlt)}">View poster</button>`
        : '';
      return `
  <article class="city city--${esc(f.id)}" id="${esc(f.id)}" aria-labelledby="${esc(f.id)}-title">
    <div class="city__cover">
      ${/\.(webp|jpe?g|png)$/i.test(f.cover)
        ? `<img src="${base}${esc(f.cover)}" alt="${esc(f.coverAlt)}" width="1600" height="837" loading="lazy">`
        : `<img src="${base}${esc(f.cover)}-800.webp" srcset="${base}${esc(f.cover)}-800.webp 800w, ${base}${esc(f.cover)}-1600.webp 1600w" sizes="(min-width: 900px) 50vw, 100vw" alt="${esc(f.coverAlt)}" width="1600" height="1067" loading="lazy" decoding="async">`}
    </div>
    <div class="city__details">
      <div class="city__info" data-number="0${i + 1}">
      <p class="city__date">${timeTag(f.date, longDate(f.date))}</p>
      <h3 id="${esc(f.id)}-title">${esc(f.city)}</h3>
      <p class="city__venue">${esc(f.venue)}</p>
      <p class="city__time"><strong>${esc(timeRange(f.startTime, f.endTime))}</strong> · Free street festival</p>
      ${f.lineup
        ? `<p class="city__lineup"><span>${esc(f.lineupLabel)}</span> ${esc(f.lineup)}</p>`
        : `<p class="city__lineup city__lineup--tba"><span>Performers</span> ${esc(announcement)}</p>`}
      ${supporting}
      <div class="city__actions">
        <a class="button button--text" href="${base}schedules/#${esc(f.id)}-schedule">${f.schedule?.length ? 'Schedule &amp; event details' : 'Event details'}</a>
        ${extLink(mapsUrl(f.mapsQuery), 'Get directions', 'button button--dark')}
        ${poster}
      </div>
      </div>
      <div class="city__more">
        <div>
          <h4>Free ${esc(f.city)} festival highlights</h4>
          <p>${esc(f.summary)}</p>
          <ul class="check-list">${highlights}</ul>
        </div>
        <div>
          <h4>${esc(f.partnersLabel || 'Our 2026 community partners')}</h4>
          <p>${esc(f.partners)}</p>
        </div>
      </div>
    </div>
  </article>`;
    })
    .join('');
  return `
<section class="section section--festivals" id="festivals" aria-labelledby="festivals-title">
  <div class="container">
    <div class="section-heading">
      <p class="eyebrow">The ${esc(year)} festival tour</p>
      <h2 id="festivals-title">Choose your city</h2>
      <p>Every festival is free and family-friendly, with recovery resources, live entertainment and community connection from noon to 5 PM.</p>
    </div>
    ${cards}
  </div>
</section>`;
}

function priceList(items, labelId) {
  const rows = items
    .map((p) => `<li><span class="price-list__name">${esc(p.name)}</span><span class="price-list__price">${esc(money(p.price))}</span></li>`)
    .join('');
  return `<ul class="price-list" aria-labelledby="${labelId}">${rows}</ul>`;
}

export function renderPartner({ base, partner, asPage = false }) {
  const H = asPage ? 'h1' : 'h2';
  const h = asPage ? 'h2' : 'h3';
  const h4 = asPage ? 'h3' : 'h4';
  return `
<section class="section section--partner" id="partner" aria-labelledby="partner-title">
  <div class="container">
    <div class="section-heading">
      <p class="eyebrow">Partner with us</p>
      <${H} id="partner-title">Support recovery across Alberta.</${H}>
      <p>${esc(partner.partnerIntro)}</p>
    </div>
    <div class="partner-groups">
      <article class="price-group price-group--sponsor" aria-labelledby="sponsorship-title">
        <${h} id="sponsorship-title">Sponsorship</${h}>
        ${priceList(partner.sponsorships, 'sponsorship-title')}
      </article>
      <article class="price-group price-group--booth" aria-labelledby="booth-title">
        <${h} id="booth-title">Booth Space <span class="price-group__sub">(not a sponsorship)</span></${h}>
        ${priceList(partner.booths, 'booth-title')}
        <p class="price-note">${esc(partner.boothNote)}</p>
        <${h4} id="rentals-title" class="price-group__subhead">Rentals</${h4}>
        ${priceList(partner.rentals, 'rentals-title')}
      </article>
    </div>
    <p class="price-footnote">${esc(partner.priceFootnote)}</p>
    <div class="section-actions">
      <a class="button button--primary" href="${base}login/?next=apply">Apply as Vendor / Sponsor</a>
    </div>
  </div>
</section>`;
}

export function renderVolunteer({ base, festivals, year, asPage = false }) {
  const H = asPage ? 'h1' : 'h2';
  const dates = festivals
    .map((f) => `<li>${timeTag(f.date, `${f.city} · ${f.date ? longDate(f.date) : 'Date TBA'}`)}</li>`)
    .join('');
  const action = asPage
    ? `<p><a class="button button--primary" href="#volunteer-signup">Sign up to volunteer</a></p>
      <p>Already signed up? Your shift email has a private link to confirm or decline your shifts. Questions? Email <a href="mailto:community@lastdoor.org">community@lastdoor.org</a>.</p>`
    : `<a class="button button--primary" href="${base}volunteer/">Volunteer with us</a>`;
  const roles = asPage
    ? `<h2 class="volunteer__roles-title">Ways to help</h2>
      <ul class="check-list check-list--columns">
        <li>Early and morning set-up</li>
        <li>Road closure greeters and vendor check-in</li>
        <li>Parking lot attendants</li>
        <li>Kids Zone: face painting, balloon art and toy tents</li>
        <li>Information table, merch and donations</li>
        <li>Waste and site clean-up</li>
        <li>Back stage and hospitality</li>
        <li>Tear down</li>
      </ul>`
    : '';
  return `
<section class="section section--volunteer${asPage ? '' : ' section--blue'}" id="volunteer" aria-labelledby="volunteer-title">
  <div class="container volunteer">
    <div class="volunteer__badge">
      <p class="volunteer__badge-kicker">3 cities, 1 movement</p>
      <p class="volunteer__badge-title">Volunteer with us</p>
      <ul class="volunteer__dates">${dates}</ul>
    </div>
    <div class="volunteer__copy">
      <p class="eyebrow">Recovery Day Alberta · Edmonton · Calgary · Red Deer</p>
      <${H} id="volunteer-title">${asPage ? 'Volunteer with us' : 'Three cities. One movement.'}</${H}>
      <p>Help make Recovery Day happen in Edmonton, Calgary or Red Deer. Whether you can give a few hours or the whole day, your time helps create a welcoming celebration for everyone.</p>
      ${action}
      ${roles}
    </div>
  </div>
</section>`;
}

export function renderSponsors({ base, sponsorBanner }) {
  const logos = sponsorBanner?.logos || [];
  if (!logos.length) return '';
  // The list is written twice so the loop is seamless; the copy is hidden from
  // screen readers so each sponsor is only read out once.
  const item = (l, copy) => {
    const img = `<img src="${base}${esc(sponsorBanner.folder)}${esc(l.file)}.webp" alt="${copy ? '' : esc(l.name)}" width="${Number(l.width)}" height="${Number(l.height)}" loading="lazy" decoding="async">`;
    return `<li class="logo-strip__item">${l.url && !copy ? extLink(l.url, img, 'logo-strip__link') : img}</li>`;
  };
  const list = (copy) => `<ul class="logo-strip__list" role="list"${copy ? ' aria-hidden="true"' : ''}>${logos.map((l) => item(l, copy)).join('')}</ul>`;
  return `
<section class="logo-strip" aria-labelledby="sponsors-title" data-logo-strip data-seconds="${Number(sponsorBanner.seconds) || 60}">
  <div class="container logo-strip__head">
    <h2 class="logo-strip__title" id="sponsors-title">${esc(sponsorBanner.title)}</h2>
    <button class="logo-strip__pause" type="button" data-logo-strip-toggle><span class="hero__pause-icon" aria-hidden="true"></span><span class="logo-strip__pause-text">Pause logos</span></button>
  </div>
  <div class="logo-strip__viewport">
    <div class="logo-strip__track">${list(false)}${list(true)}</div>
  </div>
</section>`;
}

export function renderGallery({ base, gallery }) {
  const albums = (gallery?.albums || []).filter((a) => a.photos?.length);
  if (!albums.length) return '';
  const album = (al) => {
    const n = al.photos.length;
    const src = (p, w) => `${base}${esc(al.folder)}${esc(p.file)}-${w}.webp`;
    // Fill the last row so there's never an empty gap:
    // 3 columns (wide screens): the large photo uses 4 cells.
    const rest3 = (n - 3) % 3; // photos left over after the rows beside the large one
    // 2 columns (tablets): the large photo uses a full row.
    const odd2 = (n - 1) % 2 === 1;
    const items = al.photos.map((p, i) => {
      const last = i === n - 1 && i > 0;
      const cls = ['gallery__item', i === 0 && 'gallery__item--feature',
        last && n > 3 && rest3 === 1 && 'gallery__item--span3', last && n > 3 && rest3 === 2 && 'gallery__item--span2',
        last && odd2 && 'gallery__item--span2-md'].filter(Boolean).join(' ');
      return `
        <li class="${cls}">
          <a href="${src(p, 1600)}" class="gallery__link">
            <img src="${src(p, 800)}" srcset="${src(p, 800)} 800w, ${src(p, 1600)} 1600w"
              sizes="${i === 0 ? '(min-width: 900px) 66vw, 100vw' : '(min-width: 900px) 33vw, (min-width: 560px) 50vw, 100vw'}"
              alt="${esc(p.alt)}" width="1600" height="1067" loading="lazy" decoding="async"${p.position === 'top' ? ' class="is-top"' : ''}>
            <span class="sr-only"> (opens the full-size photo)</span>
          </a>
        </li>`;
    }).join('');
    return `
    <div class="gallery-album" id="photos-${esc(al.id)}">
      <h3 class="gallery-album__title">${esc(al.title)} <span>${esc(al.caption)}</span></h3>
      <ul class="gallery" role="list">${items}
      </ul>
    </div>`;
  };
  return `
<section class="section section--gallery" id="photos" aria-labelledby="gallery-title">
  <div class="container">
    <div class="section-heading">
      <p class="eyebrow">${esc(gallery.eyebrow)}</p>
      <h2 id="gallery-title">${esc(gallery.title)}</h2>
      <p>${esc(gallery.intro)}</p>
    </div>${albums.map(album).join('')}
  </div>
</section>`;
}

export function renderAbout() {
  return `
<section class="section section--about" id="about" aria-labelledby="about-title">
  <div class="container">
    <div class="section-heading">
      <p class="eyebrow">Recovery belongs in community</p>
      <h2 id="about-title">Changing lives, building healthy community.</h2>
      <p>Recovery Day Alberta brings people, families, service providers and communities together to celebrate recovery, reduce stigma and make support more visible.</p>
    </div>
    <div class="values">
      <article>
        <p class="values__number" aria-hidden="true">01</p>
        <h3>Recovery is worth celebrating.</h3>
        <p>Turn up the music, bring the family and honour the courage behind every recovery story.</p>
      </article>
      <article>
        <p class="values__number" aria-hidden="true">02</p>
        <h3>Find your people.</h3>
        <p>Meet the peers, organizations and supports helping Albertans build strong lives in recovery.</p>
      </article>
      <article>
        <p class="values__number" aria-hidden="true">03</p>
        <h3>Make hope impossible to miss.</h3>
        <p>Three city centres become public spaces for connection, possibility and life beyond addiction.</p>
      </article>
    </div>
  </div>
</section>`;
}
