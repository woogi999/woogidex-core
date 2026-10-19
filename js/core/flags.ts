// Build-time switches for things that are in the code but not out yet.
//
// LANDING_PAGE: the new front page (js/app/pages/LandingPage.tsx, css/landing.css,
// js/app/components/landing/). It is OFF unless the build is told otherwise, so
// "/" still opens My Collection and nothing of it shows on the live site.
//
//   To see it locally:  put VITE_LANDING_PAGE=1 in .env.development.local
//                       (git-ignored, and only read by `npm run dev`)
//   To launch it:       see docs/landing-page-launch.md
//
// index.html reads the same variable (%VITE_LANDING_PAGE%) for its first-frame
// styling, because that inline script runs before any module does.
export const LANDING_PAGE = import.meta.env.VITE_LANDING_PAGE === '1';
