// =============================================================================
// SITE-WIDE TEXT: name, contact details and social links used in the footer.
// =============================================================================

export const site = {
  name: 'Recovery Day Alberta',
  organizer: 'The Last Door Recovery Society',
  tagline: 'Changing lives, building healthy community',
  hashtag: '#AlbertaRecoveryModel',
  // Hashtags shown under the buttons at the top of the home page.
  heroHashtags: ['#recoverydayalberta', '#recoveroutloud'],
  email: 'community@lastdoor.org',
  phoneDisplay: '1-888-525-9771',
  phoneLink: '+18885259771',
  facebook: 'https://www.facebook.com/profile.php?id=61560184896753',
  // Final public address (used for canonical links after go-live).
  productionUrl: 'https://recoverydayalberta.com/',
};

// Main menu. `href` is relative to the site root (no leading slash).
// Links starting with # point to a section on the home page.
export const navLinks = [
  { key: 'schedules', label: 'Schedules', href: 'schedules/' },
  { key: 'festivals', label: 'Festivals', href: '#festivals' },
  { key: 'partner', label: 'Partner', href: 'partner/' },
  { key: 'volunteer', label: 'Volunteer', href: 'volunteer/' },
  { key: 'about', label: 'About', href: '#about' },
];
