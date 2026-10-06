// =============================================================================
// PHOTO GALLERY (home page) - photos from past Recovery Day events
// =============================================================================
// One "album" per city. How to add a photo:
//   1. Make two .webp copies, 1600 px and 800 px wide, and put them in the
//      album's folder (public/images/<year>/<city>/), named like
//      my-photo-1600.webp and my-photo-800.webp (squoosh.app does this for free).
//      A new copy also drops the camera/GPS information from the file.
//   2. Add a line to that album's photos: file = the name without "-1600.webp".
//   3. alt = describe what's in the photo for people using screen readers.
// Optional: position: 'top' keeps the top of a tall photo in view when cropped.
// The first photo in each album is shown large. The grid fills itself in
// neatly whatever the number of photos. To add Calgary, copy an album block.
// Only use photos Last Door has permission to use.
// =============================================================================

export const gallery = {
  eyebrow: 'Recovery Day 2026 in pictures',
  title: 'This is what recovery looks like.',
  intro: 'Thousands of people came downtown to sing, dance, hug and celebrate recovery together.',
  albums: [
    {
      id: 'edmonton',
      title: 'Edmonton',
      caption: 'Sir Winston Churchill Square',
      folder: 'images/2026/edmonton/',
      photos: [
        { file: 'edmonton-204', alt: 'Wide view of the Recovery Day Alberta main stage in Sir Winston Churchill Square, with Canadian and Alberta flags flying above a large crowd.' },
        { file: 'edmonton-1', alt: 'A packed crowd at the front barrier, with Edmonton City Hall’s glass pyramid and downtown towers behind them.' },
        { file: 'edmonton-129', alt: 'A singer and a guitarist perform on the Recovery Day stage under a blue sky.' },
        { file: 'edmonton-148', alt: 'Fans in front of the stage cheer, one with his fist raised in the air.' },
        { file: 'edmonton-169', alt: 'Smiling audience members at the barrier clap and sing along.' },
      ],
    },
    {
      id: 'calgary',
      title: 'Calgary',
      caption: '4th Street SW',
      folder: 'images/2026/calgary/',
      photos: [
        { file: 'calgary-365', alt: 'View from the stage over a big crowd on 4th Street SW, with a historic red-brick church and downtown towers behind.' },
        { file: 'calgary-433', alt: 'A singer performs to a packed crowd, seen from behind on the stage.' },
        { file: 'calgary-294', alt: 'A dancer in brightly coloured feathered regalia spins mid-dance on stage.' },
        { file: 'calgary-300', alt: 'People join hands in a long line, dancing down the closed street.' },
        { file: 'calgary-158', alt: 'Festival-goers in cowboy hats and boots walk down the street past the vendor tents.' },
        { file: 'calgary-265', alt: 'Fans at the front barrier clap and cheer.' },
        { file: 'calgary-292', alt: 'A dancer in red regalia performs on stage beside a hand drummer.' },
        { file: 'calgary-426', alt: 'A guitarist plays in the sunshine on stage, with a second guitarist behind him.', position: 'top' },
        { file: 'calgary-135', alt: 'Two people share a long hug in the crowd near the information tents.' },
        { file: 'calgary-193', alt: 'A woman wearing a colourful balloon hat takes a photo with her phone.' },
        { file: 'calgary-368', alt: 'A large group celebrates together on stage with their arms raised, the church steeple behind them.' },
        { file: 'calgary-484', alt: 'The band plays on stage as haze drifts through the afternoon light.' },
        { file: 'calgary-297', alt: 'A dancer in feathered regalia performs on stage.' },
        { file: 'calgary-427', alt: 'Looking out from the side of the stage at the crowd and the church steeple.' },
      ],
    },
    {
      id: 'red-deer',
      title: 'Red Deer',
      caption: 'Street festival at City Hall',
      folder: 'images/2026/red-deer/',
      photos: [
        { file: 'red-deer-8285', alt: 'A huge crowd fills the street in front of the stage in downtown Red Deer, with trees and office buildings behind.' },
        { file: 'red-deer-5614', alt: 'A singer in a leather jacket appears on the big screen above the stage while a guitarist plays below.' },
        { file: 'red-deer-8014', alt: 'People hold hands and dance in a big circle in front of the stage.' },
        { file: 'red-deer-4671', alt: 'Two people share a warm hug beside the vendor tents.' },
        { file: 'red-deer-8081', alt: 'A large group stands together on the Recovery Day Alberta stage, with sponsor banners on both sides.' },
        { file: 'red-deer-8262', alt: 'Black-and-white photo of a group raising their hands together, with the packed crowd behind them.' },
        { file: 'red-deer-8340', alt: 'View from the back of the stage as the band plays to the crowd in downtown Red Deer.' },
      ],
    },
  ],
};

// =============================================================================
// HOME PAGE SLIDESHOW (behind the big headline at the top)
// =============================================================================
// Uses photos from the gallery folders above (same file names).
// Wide (landscape) photos of the stage and crowd work best. The text sits on
// the left, so photos with the main subject in the middle or right look best.
// The slideshow changes every 6 seconds and has a Pause button. It doesn't
// move for visitors who have "reduce motion" turned on.
export const heroSlides = [
  'images/2026/edmonton/edmonton-204',
  'images/2026/calgary/calgary-433',
  'images/2026/red-deer/red-deer-8285',
  'images/2026/edmonton/edmonton-129',
  'images/2026/calgary/calgary-365',
  'images/2026/red-deer/red-deer-8340',
  'images/2026/calgary/calgary-484',
  'images/2026/edmonton/edmonton-1',
  'images/2026/calgary/calgary-368',
];
