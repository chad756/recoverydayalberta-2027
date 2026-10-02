// =============================================================================
// FESTIVAL DATA - the ONE file to edit for schedules, line-ups and venues.
// =============================================================================
// How to edit:
//   - Change any text between quotes. Keep the commas and brackets.
//   - date: use 'YYYY-MM-DD' (e.g. '2027-09-18'). Leave it as null to show
//     "Date to be announced".
//   - schedule times: 24-hour 'HH:MM' (e.g. '14:00' = 2:00 PM). All times are
//     Alberta time (America/Edmonton).
//   - featured: true makes a line-up item stand out (headliners).
//   - images live in /public/images/... (paths below start without a slash).
// After saving, the dev site refreshes on its own. On GitHub, commit and push
// and the live preview updates in about 2 minutes.
//
// NOTE: The line-ups below are the 2026 line-ups, kept as placeholders until
// the 2027 line-ups are announced.
// =============================================================================

export const festivalYear = 2027;

// Shown under "Festival schedules". Keep this short.
export const scheduleIntro =
  'Plan your afternoon. All times are local to Alberta (MDT). Each festival runs from noon to 5 PM.';

// Shown in the scrolling strip under the hero.
export const highlightsStrip = [
  'Free health info fair',
  'Kids zone',
  'Live music',
  'Food trucks',
  '12–5 PM',
];

// Hero poster (the big image at the top of the home page).
export const heroPoster = {
  image: 'images/2026/all-cities-poster.webp',
  fullImage: 'images/2026/all-cities-poster.jpg',
  alt: 'Recovery Day Alberta three-city festival poster (2026 poster shown as a placeholder)',
};

export const festivals = [
  {
    id: 'edmonton',
    city: 'Edmonton',
    date: null, // e.g. '2027-09-18'
    venue: 'Sir Winston Churchill Square',
    venueShort: 'Sir Winston Churchill Square',
    startTime: '12:00',
    endTime: '17:00',
    mapsQuery: 'Sir Winston Churchill Square Edmonton Alberta',
    lineupLabel: 'Featuring',
    lineup: 'Bif Naked + Sloan',
    supporting: '',
    cover: 'images/2026/edmonton-cover.webp',
    coverAlt: 'Edmonton festival artwork featuring Bif Naked and Sloan',
    poster: 'images/2026/edmonton-poster.jpg',
    posterAlt: 'Recovery Day Alberta Edmonton poster (2026 placeholder)',
    summary:
      'Recovery Day Alberta Edmonton is a free, family-friendly street festival celebrating mental health and addiction recovery, with live performances by Bif Naked and Sloan.',
    highlights: ['Health information fair', 'Kids zone', 'Live music', 'Food trucks'],
    partners:
      'Government of Alberta, Alberta Recovery Model, The Last Door Recovery Society, RSG, The Healing Institute at Taylor Bay, Stone Bear Recovery Solutions, Beccarian Correctional Care, Recovery Coach Academy Canada, Lakeview Recovery Community and the Recovery Training Institute of Alberta.',
    schedule: [
      { time: '12:30', title: 'RSG Band' },
      { time: '14:00', title: 'Bif Naked', featured: true },
      { time: '15:00', title: 'Speeches & Indigenous Welcome' },
      { time: '16:00', title: 'Sloan', featured: true },
      { time: '17:00', title: 'Festival ends', end: true },
    ],
  },
  {
    id: 'calgary',
    city: 'Calgary',
    date: null, // e.g. '2027-09-19'
    venue: '4th Street SW, from 12th Avenue SW to 17th Avenue SW',
    venueShort: '4th Street SW · 12th to 17th Avenue SW',
    startTime: '12:00',
    endTime: '17:00',
    mapsQuery: '4th Street SW and 12th Avenue SW Calgary Alberta',
    lineupLabel: 'Headlining',
    lineup: 'Tom Cochrane',
    supporting: 'Ben Chase and many more on two stages',
    cover: 'images/2026/calgary-cover.webp',
    coverAlt: 'Calgary festival artwork featuring Tom Cochrane',
    poster: 'images/2026/calgary-poster.jpg',
    posterAlt: 'Recovery Day Alberta Calgary poster (2026 placeholder)',
    summary:
      'Recovery Day Alberta Calgary is a free, family-friendly street festival celebrating mental health and addiction recovery, headlined by Tom Cochrane with Ben Chase and many more performers on two stages.',
    highlights: ['Health information fair', 'Kids zone', 'Live music on two stages', 'Food trucks'],
    partners:
      'Government of Alberta, Alberta Recovery Model, The City of Calgary, Recovery Acres Society, Cedars Recovery, The Last Door Recovery Society, RSG, Calgary Homeless Foundation, Fresh Start Recovery, RecoverAid Medical Detox, 101.5 Today Radio, The Healing Institute at Taylor Bay, Stone Bear Recovery Solutions, Beccarian Correctional Care, Recovery Coach Academy Canada, Lakeview Recovery Community and the Recovery Training Institute of Alberta.',
    schedule: [
      { time: '12:45', title: 'New Autumn' },
      { time: '13:45', title: 'Ben Chase' },
      { time: '14:45', title: 'Speeches, Indigenous Welcome & Dance Performance' },
      { time: '16:00', title: 'Tom Cochrane', featured: true },
      { time: '17:00', title: 'Festival ends', end: true },
    ],
  },
  {
    id: 'red-deer',
    city: 'Red Deer',
    date: null, // e.g. '2027-09-25'
    venue: 'Street festival at City Hall',
    venueShort: 'City Hall · 4914 48 Avenue',
    startTime: '12:00',
    endTime: '17:00',
    mapsQuery: 'Red Deer City Hall Alberta',
    lineupLabel: 'Featuring',
    lineup: 'Trooper',
    supporting: '',
    cover: 'images/2026/red-deer-cover.webp',
    coverAlt: 'Red Deer festival artwork featuring Trooper',
    poster: 'images/2026/red-deer-poster.jpg',
    posterAlt: 'Recovery Day Alberta Red Deer poster (2026 placeholder)',
    summary:
      'Recovery Day Alberta Red Deer is a free, family-friendly street festival at City Hall celebrating mental health and addiction recovery, featuring a live performance by Trooper.',
    highlights: ['Health information fair', 'Kids zone', 'Live music', 'Food trucks'],
    partners:
      'Government of Alberta, Alberta Recovery Model, The Last Door Recovery Society, RSG, The Healing Institute at Taylor Bay, Red Deer Recovery Community, Stone Bear Recovery Solutions, Beccarian Correctional Care, Recovery Coach Academy Canada, Lakeview Recovery Community and the Recovery Training Institute of Alberta.',
    schedule: [
      { time: '13:00', title: 'Cant Hardly Play Boys' },
      { time: '14:00', title: 'Cody Hall Band' },
      { time: '15:00', title: 'Speeches & Indigenous Welcome' },
      { time: '16:00', title: 'Trooper', featured: true },
      { time: '17:00', title: 'Festival ends', end: true },
    ],
  },
];
