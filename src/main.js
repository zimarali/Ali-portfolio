// Entry point. The page already shows a static, styled name; this only
// upgrades it to 3D when the device can do it, and fails back quietly.
import { webglAvailable } from './quality.js';
import { holidayToday } from './holidays.js';

const params = new URLSearchParams(location.search);
const root = document.documentElement;
const THEMES = ['delivery', 'inflatables', 'workshop', 'shore', 'dominoes', 'popup', 'desktop', 'cyberpunk', 'forest', 'city'];

function staticMode() {
  // The static name gets its own small toy: cycle through the palettes.
  const btn = document.getElementById('another');
  let i = Math.floor(Math.random() * THEMES.length);
  root.dataset.theme = holidayToday() ?? THEMES[i];
  btn.onclick = () => {
    i = (i + 1) % THEMES.length;
    root.dataset.theme = THEMES[i];
  };
}

if (params.has('fallback') || !webglAvailable()) {
  staticMode();
} else {
  import('./app.js')
    .then(({ start }) => start())
    .catch((err) => {
      console.warn('3D unavailable, showing static name.', err);
      root.classList.remove('is-3d');
      staticMode();
    });
}
