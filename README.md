# Ramiz Ali

A one-page 3D toy built around a name. On each visit one of ten short scenes
assembles "Ramiz Ali", and then the letters stay around to be poked, thrown and
put back. On a few holidays a special scene takes over for the day.

| id | scene |
| --- | --- |
| `delivery` | A waiter robot balances a tower of letters, flips each one into place, then reverses to nudge a crooked one straight. |
| `inflatables` | Balloon letters tumble in and jiggle. The last "i" loses its dot, which bonks off the "l" on its way home. |
| `workshop` | Wooden letters flip up off a geared plank. One jams, and a peg pops up to knock it upright. |
| `shore` | A wave carries sea-glass letters up the sand. The backwash steals the "A", and a second wave brings it back with a starfish. |
| `dominoes` | A marble taps a domino run (the first tile won't fall until the second try). The letters topple, then spring upright and spread out. |
| `popup` | A pop-up book opens, the paper letters fold up, and an origami bird lands on the "A". |
| `desktop` | A retro window pops open and a caret types the name, fumbles the last letter as "o", beeps, backspaces and fixes it. A mouse pointer double-clicks the name. |
| `cyberpunk` | Neon letters streak in like data on a wet street. The power browns out, the signs stutter back on, and the "z" sparks until it gets a jolt. |
| `forest` | Mossy letters sprout out of soil mounds like saplings. The "l" overgrows and droops back, mushrooms become the i-dots, and a leaf drifts down. |
| `city` | Letters rise floor by floor like buildings. A tower crane lowers the "A", which spins on its cable, and a toy car pulls up and honks. |

### Holiday scenes

These replace the random pick on their day (the visitor's local date). The
dice still shuffles the everyday scenes, and the static fallback uses the
holiday's palette too.

| date | id | scene |
| --- | --- | --- |
| Dec 31 – Jan 1 | `newyear` | Gold and silver letters launch as rockets, burst into fireworks, float down into place, and party poppers scatter confetti. |
| Feb 14 | `valentine` | Candy-heart letters drift down under heart balloons. The "A"'s balloon yanks it back up until the string snaps. Hearts dot the i's. |
| Oct 31 | `halloween` | Pumpkin letters claw up out of a graveyard. A ghost swoops past, shouts BOO, and every letter jumps. |
| Dec 24 – 25 | `christmas` | Presents drop through falling snow and fall open to reveal the letters. One stubborn gift goes last, and a star lands on the "A". |

To add or move a holiday, edit the date table in `src/holidays.js` and mark the
scene class with `static holiday = true`.

## Playing with the letters

- **Hover** to make nearby letters lean. **Tap** one for its material's reaction.
  Typing R, A, M, I, Z or L pokes those letters too.
- **Tug** a letter and it stretches on a rubber band. Let go and it swings back.
  Pull far enough and it **pops loose**.
- **Fling** a loose letter (or flick hard while tugging) and it flies off. It
  tumbles, bounces, slides, can knock into other letters, and can leave the
  screen entirely. Tap a loose letter to make it hop.
- A **ghost** marks each empty place, so the name stays readable.
- To **put a letter back**, carry it near its ghost: the ghost pulls it in and
  it lands with a thunk that shivers through its neighbours. You can also tap
  the ghost or press the letter's key to fly it home. **Esc** brings every
  letter home.

## Run it

It's a static site with no build step. `vendor/` and `assets/` are committed.

```bash
npm install   # only needed for the dev tools below
npm run dev   # http://localhost:5173
```

Any static server works too. GitHub Pages serves it as-is (`CNAME` is kept).

Useful URL parameters:

- `?scene=shore` plays a specific scene, holidays included.
- `?date=12-25` pretends it's that date, for checking holiday scenes.
- `?motion=reduced` forces reduced motion: no entrance, no idle moments.
- `?fallback` shows the static, no-WebGL version.
- `?quality=low|medium|high` overrides the auto-detected rendering tier.
- `?freeze=2.5` holds the entrance at 2.5 s. From the console, `nameToy.snap(2.5)` does the same.

Maintenance scripts:

- `npm run vendor` rebuilds `vendor/three.min.js` (three.js plus the few addons used).
- `npm run font` regenerates `assets/name-font.json` from Fredoka. Pass a weight and characters to change it, e.g. `node tools/build-font.mjs 700 "Ramiz Ali"`.

## How it fits together

```
src/main.js          feature-detects WebGL, loads app.js, falls back quietly
src/app.js           director: picks/swaps scenes, resize, controls, sound toggle
src/stage.js         renderer, lights, tabletop, camera framing, on-demand render loop
src/typography.js    font → per-letter extruded meshes + one/two-row layout
src/interaction.js   hover, pokes, tug → pop loose → carry/throw, magnetic snap home, ghosts
src/physics.js       tiny rigid-body sim for loose letters (box corners, friction, sleep)
src/motion.js        easing, springs, bounce/wobble helpers
src/picker.js        shuffled scene bag in localStorage (memory-only if blocked)
src/sound.js         synthesised sounds, muted by default
src/holidays.js      which date gets which holiday scene
src/effects.js       glow texture and a pooled point cloud (sparks, confetti, snow)
src/scenarios/*.js   the scenes, each extending Scene (base.js)
```

Each letter has three nested transforms. The scene animates `root`, interaction
(springs at home, physics while loose) moves `inner`, and per-letter reactions
bend the `body` mesh. A letter that has been picked up or thrown drops out of
the choreography, so tossing works even mid-entrance. A scene can override
`groundAt(x, z)` to give thrown letters something to land on (the workshop's
planks, the pop-up book).

The render loop only runs while something is moving. It stops when the scene
settles, pauses when the tab is hidden, and drops to a lower quality tier if
frames keep running long. A scene can opt into quiet background life by
overriding `ambient(seconds)` and returning true. The stage then ticks at about
24 fps instead of sleeping, so the cyberpunk city keeps flickering. Ambient life
is off for reduced motion and while the tab is hidden.

## Adding a scene

1. Create `src/scenarios/myscene.js`:

   ```js
   import * as THREE from 'three';
   import { Scene } from './base.js';
   import { ease, span } from '../motion.js';

   export class MyScene extends Scene {
     static id = 'myscene';
     title = 'My scene';                 // announced to screen readers
     duration = 4;                       // seconds; keep it within 3–6
     look = { background: 0xeeeeee, floor: 0xe6e6e6 };       // palette + lights
     letterStyle = { depth: 0.24, bevel: 0.04 };              // extrusion

     material(ch, i) { return new THREE.MeshStandardMaterial({ color: 0xff6644 }); }

     build() {
       // Create props with this.add(mesh); register GPU resources with this.track(x).
       // Optional: this.sfx(time, 'pop') for sound cues, this.pokeables for clickable props.
     }

     pose(t) {
       // Must be a pure function of t: place every letter (letter.root) and prop.
       // At t = duration everything must sit at rest (letter.slot / letter.rest).
       for (const l of this.letters) {
         const u = ease.outBack(span(t, l.index * 0.1, 0.6));
         l.root.position.set(l.slot.x, (1 - u) * 3, l.slot.z);
       }
     }

     react(letter) { /* optional material-specific poke; default is a squash-hop */ }
   }
   ```

2. Register it in `src/scenarios/index.js`. The picker, the shuffle button and
   `?scene=myscene` will pick it up automatically.
3. Optional: add a matching `[data-theme='myscene']` palette in `styles.css`.
   The static fallback and the corner controls use it.

Since `pose(t)` is pure, reduced motion, layout changes and the shuffle button
can all jump a scene straight to its finished state with `skip()`.
