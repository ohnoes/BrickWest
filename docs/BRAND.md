# Brickwest brand

Internal tool, so we get to have fun. Useful information always comes first; the joke rides along after it.

## Mark
`backend/public/brand/mark.svg` (also `favicon.svg`): a pint laid in brick courses under a head of foam, on Brickwest green.

## Colour
| Token | Hex | Use |
| --- | --- | --- |
| Brickwest green | `#1e4a39` | Rail, sign-in, primary buttons |
| Deep green | `#153628` | Hover, mobile night background (`#0f1d18`) |
| Wort amber | `#c4820e` (`#e0a03a` on dark) | Full tanks, focus, quips, accents |
| Brick | `#9c3d2a` | The brick course along the top of the rail |
| Stainless | `#eef1ef` | Page background |
| Foam | `#fffaf0` / `#ffffff` | Cards, fields |

Web tokens live in `backend/public/app.css`; mobile tokens in `mobile/src/brand/index.js`.

## Type
Barlow Condensed for headings and figures, Barlow for body text.

## Voice
Plain first, pun second. Seasonal greetings on Today (Oktoberfest, International Beer Day, St. Patrick's, Repeal Day, Friday beer o'clock).
All copy lives in `backend/public/brand.js` (web) and `mobile/src/brand/index.js` (mobile). Add lines there, not inline.

## Easter eggs
Don't tell the new hires.
- **Konami code** (↑ ↑ ↓ ↓ ← → ← → B A) on the web app: foam party and an achievement.
- **Type `prost` or `cheers`** anywhere outside a text field: a toast in a random language.
- **Click the logo five times:** you've earned a shift beer.
- **Add a task with "taste", "sample", "drink" or "QC"** in the title: management approves.
- **Open the dev tools:** there's a pint in the console.
- **Mobile:** tap "Brewmaster" on the login screen five times.

Motion respects `prefers-reduced-motion`.
