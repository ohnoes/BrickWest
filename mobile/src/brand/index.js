// Brickwest brand tokens and voice for the mobile app.
// The web app's copy lives in backend/public/brand.js; keep the two in step.

export const colors = {
  red: '#78101a',       // Brick West red (the BW monogram)
  bg: '#181313',        // near-black, as on brickwestbrewingco.com
  surface: '#2a2020',   // cards and inputs
  amber: '#d6a641',     // Brick West gold
  brick: '#850e19',     // brick red accent
  cream: '#f2e4c8',
};

const pick = list => list[Math.floor(Math.random() * list.length)];

export const taglines = [
  'Relax. Don’t worry. Check the gravity.',
  'Where good beer gets its paperwork.',
  'Brewing is 90% cleaning. This is the other 10%.',
  'Malt, hops, yeast, water, and one very good spreadsheet replacement.',
];
export const tagline = () => pick(taglines);

export function greeting(now = new Date()) {
  const m = now.getMonth(), day = now.getDate(), dow = now.getDay(), hour = now.getHours();
  if (m === 7 && dow === 5 && day <= 7) return 'Happy International Beer Day. Act natural.';
  if (m === 2 && day === 17) return 'St. Patrick’s Day. No green beer. We have standards.';
  if ((m === 8 && day >= 16) || (m === 9 && day <= 5)) return 'O’zapft is! Oktoberfest season is on.';
  if (dow === 5 && hour >= 15) return 'It’s Friday after three. That’s officially beer o’clock.';
  if (dow === 1 && hour < 12) return 'Monday. Coffee first, then gravity readings.';
  return pick(['Relax, don’t worry, check the gravity.', 'Another day, another dry hop.', 'May your fermentations be clean and your seals tight.']);
}

export const cheers = () => pick(['Prost!', 'Cheers!', 'Sláinte!', 'Salud!', 'Skål!', 'Kanpai!', 'Na zdrowie!', 'Proost!']);
