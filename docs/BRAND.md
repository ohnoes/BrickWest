# Brick West brand

Internal tool, so we get to have fun. Useful information always comes first; the joke rides along after it.

## Mark
`backend/public/brand/mark.svg`: the boxed BW monogram from the Brick West Brewing Co. logo, rebuilt so it reads at icon sizes. The original's tiny stacked "BC" is gone; two gold brick courses sit under the letters instead. `favicon.svg` is a simplified version for 16px.

Wordmark: **BRICK WEST** in spaced uppercase condensed caps, as on [brickwestbrewingco.com](https://brickwestbrewingco.com/).

## Colour
Taken from brickwestbrewingco.com.

| Token | Hex | Use |
| --- | --- | --- |
| Brick West red | `#78101a` | Monogram, sign-in panel, primary buttons |
| Deep red | `#5a0b13` | Hover |
| Near-black | `#181313` | Sidebar rail, text, mobile background |
| Gold | `#d6a641` (`#8a5f0f` for text) | Brick courses, full tanks, focus, quips |
| Cream | `#f2e4c8` / `#f4ede0` | Monogram letters, page background |

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
