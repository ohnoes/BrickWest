// Brickwest brand voice: quips, seasonal greetings and easter eggs.
// Internal tool, so the jokes stay in; everything useful is still said plainly.
// Mobile keeps a copy of QUIPS in mobile/src/brand/index.js; update both.

export const QUIPS = {
  tagline: [
    'Tanks, batches, readings and stock for the brewhouse floor.',
    'Relax. Don’t worry. Check the gravity.',
    'Malt, hops, yeast, water, and one very good spreadsheet replacement.',
    'Where good beer gets its paperwork.',
    'Brewing is 90% cleaning. This is the other 10%.',
  ],
  loading: [
    'Sparging the data…', 'Waiting for the krausen to drop…', 'Pitching the yeast…',
    'Taking a gravity reading…', 'Vorlaufing until it runs clear…', 'Letting it condition…',
  ],
  done: [
    'Done. That one’s in the bag (of grain).', 'Done. Prost!', 'Done. Hop to the next one.',
    'Done. Cleaner than a CIP cycle.', 'Done. Somebody pour this person a shift beer.',
  ],
  emptyTanks: 'An empty brewery is just a very clean room.',
  emptyTasks: 'Nothing open. Suspicious. Go check the glycol.',
  error: 'This page got stuck in the mash',
  cheers: ['Prost!', 'Cheers!', 'Sláinte!', 'Salud!', 'Skål!', 'Kanpai!', 'Na zdrowie!', 'Santé!', 'Gān bēi!', 'Proost!'],
  drinkingTask: 'Noted. Quality control is very important work.',
};

const pick = list => list[Math.floor(Math.random() * list.length)];
export const quip = key => (Array.isArray(QUIPS[key]) ? pick(QUIPS[key]) : QUIPS[key]);

// First Friday in August is International Beer Day.
const isBeerDay = d => d.getMonth() === 7 && d.getDay() === 5 && d.getDate() <= 7;

// A one-liner for the Today header; seasonal ones win over the day-of-week ones.
export function greeting(now = new Date()) {
  const m = now.getMonth(), day = now.getDate(), dow = now.getDay(), hour = now.getHours();
  if (isBeerDay(now)) return 'Happy International Beer Day. Act natural.';
  if (m === 2 && day === 17) return 'St. Patrick’s Day. No green beer. We have standards.';
  if ((m === 8 && day >= 16) || (m === 9 && day <= 5)) return 'O’zapft is! Oktoberfest season is on.';
  if (m === 3 && day === 7) return 'National Beer Day. Repeal Day’s cooler older sibling.';
  if (m === 11 && day === 5) return 'Repeal Day. Raise one to the 21st Amendment.';
  if (dow === 5 && hour >= 15) return 'It’s Friday after three. That’s officially beer o’clock.';
  if (dow === 1 && hour < 12) return 'Monday. Coffee first, then gravity readings.';
  if (hour < 7) return 'Early start. The yeast never sleeps, and apparently neither do you.';
  if (hour >= 21) return 'Late shift. Don’t forget to clean up after the last transfer.';
  return pick(['Relax, don’t worry, check the gravity.', 'Another day, another dry hop.', 'May your fermentations be clean and your seals tight.']);
}

export function taskToast(title = '') {
  return /\b(drink|taste|tasting|sample|beer me|qc)\b/i.test(title) ? QUIPS.drinkingTask : 'Task added';
}

// ---- Easter eggs -----------------------------------------------------------
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Rising foam bubbles across the screen.
export function foamParty(count = 40) {
  if (reduceMotion() || document.querySelector('.foam-party')) return;
  const layer = document.createElement('div');
  layer.className = 'foam-party';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const b = document.createElement('span');
    const size = 6 + Math.random() * 22;
    b.style.left = `${Math.random() * 100}%`;
    b.style.width = b.style.height = `${size}px`;
    b.style.animationDuration = `${2.8 + Math.random() * 3}s`;
    b.style.animationDelay = `${Math.random() * 1.5}s`;
    layer.append(b);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 7000);
}

const typingInField = e => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;

export function installEasterEggs({ toast }) {
  // Konami code: ↑ ↑ ↓ ↓ ← → ← → B A
  const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let k = 0, typed = '';
  window.addEventListener('keydown', e => {
    if (typingInField(e)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    k = key === konami[k] ? k + 1 : (key === konami[0] ? 1 : 0);
    if (k === konami.length) { k = 0; foamParty(); toast('Achievement unlocked: Hop Head. +1 IBU to your personality.'); }
    if (key.length === 1) {
      typed = (typed + key).slice(-6);
      if (typed.endsWith('prost') || typed.endsWith('cheers')) { typed = ''; toast(`${quip('cheers')} 🍻`); }
    }
  });

  // Click the logo five times in a row.
  let clicks = 0, clickTimer;
  document.addEventListener('click', e => {
    if (!e.target.closest?.('.brand-mark')) return;
    clicks += 1; clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { clicks = 0; }, 1500);
    if (clicks === 5) { clicks = 0; foamParty(); toast('Okay, okay. You’ve earned a shift beer.'); }
  });

  // For whoever opens the dev tools.
  console.log('%c\n   .~~~~.\n   i====i_\n   |cccc|_)\n   |cccc|\n   `-==-´\n', 'color:#c4820e;font-family:monospace');
  console.log('%cBrickwest Brewmaster. Poking around the source? Hoppy to see you. 🍺 (Try the Konami code.)', 'color:#1e4a39;font-weight:600');
}
