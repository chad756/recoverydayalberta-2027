// =============================================================================
// SPONSOR LOGO BANNER (scrolls under the slideshow on the home page)
// =============================================================================
// How to add a logo:
//   1. Trim the empty space around the logo and save it as a .webp (or .png)
//      about 2x the display size, in public/images/sponsors/  (e.g. acme.webp).
//   2. Add a line below. name = the sponsor's name (read out to screen readers).
//   3. width/height = display size in pixels. To keep logos looking the same
//      "visual size", aim for width x height of about 9,600 (e.g. 150 x 64):
//        wide logos  -> about 200-240 wide x 35-47 high
//        square-ish  -> about 100-130 wide x 70-78 high
//      Logos on a solid colour block look heavier, so make those ~15% smaller.
//   Optional: url: 'https://...' makes the logo a link to the sponsor's website.
// The order below is the order they scroll in. Remove a line to remove a logo.
// =============================================================================

export const sponsorBanner = {
  title: 'Thank you to our sponsors and partners',
  folder: 'images/sponsors/',
  // Seconds for one full loop. Bigger number = slower.
  seconds: 75,
  logos: [
    { file: 'alberta-recovery-model', name: 'Alberta Recovery Model, Government of Alberta', width: 180, height: 53 },
    { file: 'city-of-calgary', name: 'The City of Calgary', width: 123, height: 59 },
    { file: 'rsg', name: 'RSG', width: 181, height: 53 },
    { file: 'healing-institute-taylor-bay', name: 'The Healing Institute at Taylor Bay', width: 203, height: 47 },
    { file: 'unifor', name: 'Unifor', width: 103, height: 78 },
    { file: 'stone-bear', name: 'Stone Bear Recovery Solutions', width: 59, height: 78 },
    { file: 'beccarian', name: 'Beccarian Correctional Care', width: 110, height: 78 },
    { file: 'lakeview', name: 'Lakeview Recovery Community', width: 206, height: 47 },
    { file: 'rtia', name: 'Recovery Training Institute of Alberta', width: 240, height: 35 },
    { file: 'core', name: 'CORE – Canadian Centre of Recovery Excellence', width: 128, height: 75 },
    { file: 'calgary-recovery-community', name: 'Calgary Recovery Community', width: 227, height: 42 },
    { file: 'cedars', name: 'Cedars Recovery', width: 70, height: 70 },
    { file: 'recoveraid', name: 'RecoverAid Medical Distribution', width: 76, height: 76 },
    { file: 'red-deer-dream-centre', name: 'Red Deer Dream Centre', width: 158, height: 61 },
    { file: 'last-door-red-deer-recovery-community', name: 'The Last Door Red Deer Recovery Community', width: 160, height: 60 },
    { file: 'vibe-car-audio', name: 'Vibe Car Audio', width: 122, height: 71 },
    { file: 'drumit', name: 'Drumit Chipping, Repair & Fabrication', width: 129, height: 74 },
    { file: 'newton-aviation', name: 'Newton Aviation', width: 228, height: 42 },
  ],
};
