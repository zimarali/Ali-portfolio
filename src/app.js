// The director: owns the stage, picks a scene, swaps scenes on request,
// keeps the layout right on resize and routes pokes to the active scene.
import { Stage } from './stage.js';
import { pickTier, downgrade } from './quality.js';
import { loadFont, computeLayout } from './typography.js';
import { Interaction } from './interaction.js';
import { ScenePicker } from './picker.js';
import { Sound } from './sound.js';
import { SCENES, EVERYDAY } from './scenarios/index.js';
import { holidayToday } from './holidays.js';

const params = new URLSearchParams(location.search);
const root = document.documentElement;

export async function start() {
  const canvas = document.querySelector('.stage__canvas');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const forcedMotion = params.get('motion');
  const reduced = () => (forcedMotion ? forcedMotion === 'reduced' : motionQuery.matches);

  let tier = pickTier();
  const font = await loadFont();
  const stage = new Stage(canvas, tier);
  const sound = new Sound();
  const interaction = new Interaction(stage, { reducedMotion: reduced(), sound });
  const picker = new ScenePicker(EVERYDAY);
  const status = document.getElementById('scene-status');

  let scene = null;
  let layout = null;
  const layoutFor = (id) => computeLayout(font, stage.aspect, { tracking: SCENES[id].tracking });
  let switching = false;

  function show(id, { entrance = true } = {}) {
    scene?.dispose();
    layout = layoutFor(id);
    const ctx = { stage, font, layout, tier, sound, interaction, reducedMotion: reduced() };
    scene = new SCENES[id](ctx);
    scene.id = id;
    scene.init();
    if (!entrance || ctx.reducedMotion) scene.skip();
    interaction.reducedMotion = ctx.reducedMotion;
    interaction.setLetters(scene.letters);
    interaction.pokeables = scene.pokeables ?? [];
    interaction.groundAt = (x, z) => scene.groundAt(x, z);
    // Debug: ?freeze=2.5 holds the entrance at that moment.
    if (params.has('freeze')) {
      const at = Number(params.get('freeze'));
      scene.update = () => { scene.pose(at); return false; };
    }
    root.dataset.theme = id;
    status.textContent = scene.title ?? '';
    stage.wake();
  }

  interaction.onPoke = (letter, point) => {
    scene.react(letter, point);
    stage.wake();
  };

  stage.onTick = (dt) => {
    const a = scene.update(dt);
    const b = interaction.update(dt);
    if (a || b) scene.updateBlobs();
    // Some scenes keep a quiet background alive once their entrance is over.
    const ambient = scene.done && !scene.ctx.reducedMotion && scene.ambient(performance.now() / 1000);
    return a || b ? true : ambient ? 'ambient' : false;
  };

  stage.onSlow = () => {
    tier = downgrade(tier);
    stage.applyTier(tier);
    if (scene) scene.ctx.tier = tier;
  };

  // Layout follows the screen: one line on wide screens, two rows on tall ones.
  new ResizeObserver(() => {
    stage.resize();
    if (!scene) return;
    if (layoutFor(scene.id).mode !== layout.mode) {
      show(scene.id, { entrance: false });
    } else {
      stage.frame(scene.frameBox(), scene.framing ?? {});
    }
    stage.wake();
  }).observe(canvas.parentElement);

  motionQuery.addEventListener?.('change', () => {
    interaction.reducedMotion = reduced();
    if (reduced()) scene.skip();
  });

  // Discover another scene without reloading.
  const another = document.getElementById('another');
  another.onclick = () => {
    if (switching) return;
    switching = true;
    another.classList.remove('is-rolling');
    void another.offsetWidth;
    another.classList.add('is-rolling');
    root.classList.add('is-switching');
    setTimeout(() => {
      show(picker.next());
      requestAnimationFrame(() => { root.classList.remove('is-switching'); switching = false; });
    }, reduced() ? 0 : 230);
  };

  const soundBtn = document.getElementById('sound');
  soundBtn.hidden = false;
  soundBtn.onclick = () => {
    const on = sound.setEnabled(!sound.enabled);
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    if (on) sound.play('pop', { gain: 0.6 });
  };

  // A specific request wins; then today's holiday; otherwise the shuffle.
  const requested = params.get('scene');
  const holiday = holidayToday();
  let first;
  if (SCENES[requested]) {
    first = requested;
    if (!SCENES[first].holiday) picker.mark(first);
  } else if (holiday) {
    first = holiday; // doesn't use up a turn in the everyday shuffle
  } else {
    first = picker.next();
  }
  show(first);

  // Reveal the canvas once something has actually been drawn.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-3d')));

  // Handy for debugging from the console; harmless otherwise.
  window.nameToy = {
    get scene() { return scene; }, show, stage, picker,
    /** Renders the entrance at time t immediately (for checking choreography). */
    snap(t) {
      root.classList.add('is-3d', 'is-snapshot');
      scene.update = () => false;
      scene.pose(t);
      scene.tick?.(0);
      scene.updateBlobs();
      stage.renderer.render(stage.scene, stage.camera);
    },
  };
}
