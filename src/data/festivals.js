// =============================================================================
// FESTIVAL DATA - the ONE file to edit for schedules, line-ups and venues.
// =============================================================================
// How to edit:
//   - Change any text between quotes. Keep the commas and brackets.
//   - date: once Supabase is set up, dates come from the admin site
//     (Settings → Festival dates) and the dates below are only a fallback.
//     Format 'YYYY-MM-DD' (e.g. '2027-09-18'). Leave it as null to show
//     "Date to be announced".
//   - schedule times: 24-hour 'HH:MM' (e.g. '14:00' = 2:00 PM). All times are
//     Alberta time (America/Edmonton).
//   - lineup: performer names. Leave it '' until performers are announced -
//     the site then shows the "announcement" text below instead.
//   - schedule: leave it [] until the schedule is released - the site then
//     shows opening time, "Performers & full schedule released in 2027" and
//     closing time. To add it: { time: '14:00', title: 'Band name', featured: true }
//     (featured: true makes a line-up item stand out, e.g. headliners).
//   - images live in /public/images/... (paths below start without a slash).
// After saving, the dev site refreshes on its own. On GitHub, commit and push
// and the live preview updates in about 2 minutes.
//
// NOTE: 2027 performers and schedules haven't been announced yet.
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

// Shown wherever performers or the schedule would go, until they're added.
export const announcement = 'Performers and full schedule to be released in 2027.';

// Optional "View the poster" button at the top of the home page.
// Set to null to hide it. When the 2027 poster is ready, use:
// { image: 'images/2027/poster.webp', fullImage: 'images/2027/poster.jpg', alt: 'Recovery Day Alberta 2027 poster' }
export const heroPoster = null;

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
    lineup: '', // e.g. 'Band name + Band name'
    supporting: '',
    cover: 'images/2026/edmonton/edmonton-204', // photo shown on the city card (800 + 1600 px .webp)
    coverAlt: 'The Recovery Day Alberta stage and a big crowd in Sir Winston Churchill Square, Edmonton, in 2026',
    poster: null, // e.g. 'images/2027/edmonton-poster.jpg'
    posterAlt: '',
    summary:
      'Recovery Day Alberta Edmonton is a free, family-friendly festival in Sir Winston Churchill Square celebrating mental health and addiction recovery, with live music, a health information fair and a kids zone.',
    highlights: ['Health information fair', 'Kids zone', 'Live music', 'Food trucks'],
    partners:
      'Government of Alberta, Alberta Recovery Model, The Last Door Recovery Society, RSG, The Healing Institute at Taylor Bay, Stone Bear Recovery Solutions, Beccarian Correctional Care, Recovery Coach Academy Canada, Lakeview Recovery Community and the Recovery Training Institute of Alberta.',
    schedule: [], // released in 2027
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
    lineupLabel: 'Featuring',
    lineup: '', // e.g. 'Band name + Band name'
    supporting: '',
    cover: 'images/2026/calgary/calgary-365', // photo shown on the city card (800 + 1600 px .webp)
    coverAlt: 'A big crowd on 4th Street SW in front of the Recovery Day stage in Calgary in 2026',
    poster: null, // e.g. 'images/2027/calgary-poster.jpg'
    posterAlt: '',
    summary:
      'Recovery Day Alberta Calgary is a free, family-friendly street festival on 4th Street SW celebrating mental health and addiction recovery, with live music, a health information fair and a kids zone.',
    highlights: ['Health information fair', 'Kids zone', 'Live music', 'Food trucks'],
    partners:
      'Government of Alberta, Alberta Recovery Model, The City of Calgary, Recovery Acres Society, Cedars Recovery, The Last Door Recovery Society, RSG, Calgary Homeless Foundation, Fresh Start Recovery, RecoverAid Medical Detox, 101.5 Today Radio, The Healing Institute at Taylor Bay, Stone Bear Recovery Solutions, Beccarian Correctional Care, Recovery Coach Academy Canada, Lakeview Recovery Community and the Recovery Training Institute of Alberta.',
    schedule: [], // released in 2027
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
    lineup: '', // e.g. 'Band name + Band name'
    supporting: '',
    cover: 'images/2026/red-deer/red-deer-8285', // photo shown on the city card (800 + 1600 px .webp)
    coverAlt: 'A crowd filling the street in front of the Recovery Day stage at Red Deer City Hall in 2026',
    poster: null, // e.g. 'images/2027/red-deer-poster.jpg'
    posterAlt: '',
    summary:
      'Recovery Day Alberta Red Deer is a free, family-friendly street festival at City Hall celebrating mental health and addiction recovery, with live music, a health information fair and a kids zone.',
    highlights: ['Health information fair', 'Kids zone', 'Live music', 'Food trucks'],
    partners:
      'Government of Alberta, Alberta Recovery Model, The Last Door Recovery Society, RSG, The Healing Institute at Taylor Bay, Red Deer Recovery Community, Stone Bear Recovery Solutions, Beccarian Correctional Care, Recovery Coach Academy Canada, Lakeview Recovery Community and the Recovery Training Institute of Alberta.',
    schedule: [], // released in 2027
  },
];
