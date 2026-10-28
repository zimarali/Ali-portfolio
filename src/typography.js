// Typography: turns "Ramiz Ali" into individually animatable 3D letters
// and works out where each letter rests for the current screen shape.
import * as THREE from 'three';
import { Font } from 'three';

export const NAME = 'Ramiz Ali';
const CAP = 1; // world-space cap height of the name
let fontPromise;

export function loadFont() {
  fontPromise ??= fetch(new URL('../assets/name-font.json', import.meta.url))
    .then((r) => { if (!r.ok) throw new Error('font'); return r.json(); })
    .then((json) => new Font(json));
  return fontPromise;
}

/** Font units → world units so that capitals are CAP tall. */
const fontScale = (font) => CAP / 0.69 / font.data.resolution;

/**
 * Builds extruded geometry for a glyph, re-centred so the pivot sits at the
 * bottom-centre of the letter (handy for squash, tipping and hinging).
 * Lowercase "i" returns its tittle as a separate piece so it can hop.
 */
function glyphGeometry(font, ch, opts) {
  const size = CAP / 0.69;
  const shapes = font.generateShapes(ch, size);
  const extrude = {
    depth: opts.depth,
    curveSegments: opts.curveSegments ?? 8,
    bevelEnabled: opts.bevel > 0,
    bevelThickness: opts.bevel,
    bevelSize: opts.bevel * (opts.bevelSpread ?? 0.8),
    bevelSegments: opts.bevelSegments ?? 4,
  };
  let dotShapes = [];
  let bodyShapes = shapes;
  if (ch === 'i' && shapes.length > 1) {
    // The tittle is whichever outline starts highest.
    const top = (s) => Math.min(...s.getPoints(4).map((p) => p.y));
    const sorted = [...shapes].sort((a, b) => top(b) - top(a));
    dotShapes = [sorted[0]];
    bodyShapes = sorted.slice(1);
  }
  const body = new THREE.ExtrudeGeometry(bodyShapes, extrude);
  body.computeBoundingBox();
  const bb = body.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2;
  const shift = new THREE.Vector3(-cx, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  body.translate(shift.x, shift.y, shift.z);
  body.computeBoundingBox();

  let dot = null;
  if (dotShapes.length) {
    dot = new THREE.ExtrudeGeometry(dotShapes, extrude);
    dot.translate(shift.x, shift.y, shift.z);
    dot.computeBoundingBox();
    const c = new THREE.Vector3();
    dot.boundingBox.getCenter(c);
    dot.translate(-c.x, -c.y, -c.z);
    dot.computeBoundingBox();
    dot.userData.offset = c; // where the tittle sits relative to the pivot
  }
  return { body, dot };
}

/**
 * Lays the name out on the tabletop. Wide screens get one line; tall,
 * narrow screens stack "Ramiz" behind "Ali" like two rows of toys.
 */
export function computeLayout(font, aspect, { tracking = 0.06, rowGap = 2.4 } = {}) {
  const s = fontScale(font);
  const words = NAME.split(' ');
  const mode = aspect < 0.9 ? 'double' : 'single';
  const glyph = (ch) => font.data.glyphs[ch];
  const wordWidth = (w) => [...w].reduce((sum, ch, i) => sum + glyph(ch).ha * s + (i ? tracking : 0), 0);

  const slots = [];
  const rows = [];
  const place = (word, startX, z, row) => {
    let x = startX;
    const indices = [];
    for (const ch of word) {
      const g = glyph(ch);
      const center = x + ((g.x_min + g.x_max) / 2) * s;
      indices.push(slots.length);
      slots.push({ char: ch, row, x: center, z, width: (g.x_max - g.x_min) * s });
      x += g.ha * s + tracking;
    }
    rows.push({ indices, z, xMin: slots[indices[0]].x - slots[indices[0]].width / 2, xMax: slots.at(-1).x + slots.at(-1).width / 2 });
  };

  if (mode === 'single') {
    const space = Math.max(0.4, glyph(' ').ha * s) + tracking * 2;
    const total = wordWidth(words[0]) + space + wordWidth(words[1]);
    place(words[0], -total / 2, 0, 0);
    place(words[1], -total / 2 + wordWidth(words[0]) + space, 0, 0);
    // One line is one row.
    const [a, b] = rows.splice(0, 2);
    rows.push({ indices: [...a.indices, ...b.indices], z: 0, xMin: a.xMin, xMax: b.xMax });
  } else {
    place(words[0], -wordWidth(words[0]) / 2, -rowGap / 2, 0);
    place(words[1], -wordWidth(words[1]) / 2, rowGap / 2, 1);
  }
  // Optical centring: measure the real ink extents rather than advances.
  const xMin = Math.min(...rows.map((r) => r.xMin));
  const xMax = Math.max(...rows.map((r) => r.xMax));
  const dx = -(xMin + xMax) / 2;
  for (const sl of slots) sl.x += dx;
  for (const r of rows) { r.xMin += dx; r.xMax += dx; }
  const zMin = Math.min(...rows.map((r) => r.z)) - 0.6;
  const zMax = Math.max(...rows.map((r) => r.z)) + 0.6;
  return {
    mode,
    slots,
    rows,
    box: new THREE.Box3(new THREE.Vector3(xMin + dx, 0, zMin), new THREE.Vector3(xMax + dx, CAP * 1.05, zMax)),
  };
}

/**
 * One letter = three nested transforms:
 *   root  – driven by the scene's choreography (rests at the layout slot)
 *   inner – driven by interaction springs (hover, poke, drag)
 *   body  – the mesh, pivoting at its bottom-centre
 */
export class Letter {
  constructor(font, ch, index, opts, material, dotMaterial) {
    this.char = ch;
    this.index = index;
    const { body, dot } = glyphGeometry(font, ch, opts);
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.body = new THREE.Mesh(body, material);
    this.body.castShadow = this.body.receiveShadow = true;
    this.inner.add(this.body);
    this.dot = null;
    if (dot) {
      this.dot = new THREE.Mesh(dot, dotMaterial || material);
      this.dot.castShadow = this.dot.receiveShadow = true;
      this.dotHome = dot.userData.offset.clone();
      this.dot.position.copy(this.dotHome);
      this.inner.add(this.dot);
    }
    const bb = body.boundingBox;
    this.size = new THREE.Vector3().subVectors(bb.max, bb.min);
    if (this.dot) this.size.y = this.dotHome.y + dot.boundingBox.max.y;
    // Generous invisible hit box, so thin letters are easy to tap.
    const pad = 0.16;
    this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.5, this.size.x + pad), this.size.y + pad, this.size.z + pad * 2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.hit.position.y = this.size.y / 2;
    this.hit.userData.letter = this;
    this.inner.add(this.hit);

    this.rest = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    this.slot = null;
  }

  /**
   * A faint imprint of the letter left at home while it is away. Tapping it
   * calls the letter back.
   */
  makeGhost(color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    this.ghost = new THREE.Group();
    this.ghost.add(new THREE.Mesh(this.body.geometry, mat));
    if (this.dot) {
      const d = new THREE.Mesh(this.dot.geometry, mat);
      d.position.copy(this.dotHome);
      this.ghost.add(d);
    }
    this.ghostHit = new THREE.Mesh(this.hit.geometry, this.hit.material);
    this.ghostHit.position.copy(this.hit.position);
    this.ghostHit.userData.ghostOf = this;
    this.ghost.add(this.ghostHit);
    this.ghost.visible = false;
    this.ghost.renderOrder = 2;
    this.root.add(this.ghost);
  }

  setSlot(slot) {
    this.slot = slot;
    this.rest.position.set(slot.x, 0, slot.z);
  }

  /** Puts the root exactly at its resting transform. */
  toRest() {
    this.root.position.copy(this.rest.position);
    this.root.quaternion.copy(this.rest.quaternion);
    this.root.scale.set(1, 1, 1);
    this.root.visible = true;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    if (this.dot) { this.dot.position.copy(this.dotHome); this.dot.rotation.set(0, 0, 0); this.dot.scale.set(1, 1, 1); }
  }

  dispose() {
    this.body.geometry.dispose();
    this.dot?.geometry.dispose();
    this.hit.geometry.dispose();
    this.hit.material.dispose();
    this.ghost?.children[0].material.dispose();
  }
}

/**
 * Creates the eight letters with per-letter materials.
 * `materialFor(char, i)` lets each scene paint its own palette.
 */
export function createLetters(font, opts, materialFor, dotMaterialFor) {
  const letters = [];
  let i = 0;
  for (const ch of NAME) {
    if (ch === ' ') continue;
    letters.push(new Letter(font, ch, i, opts, materialFor(ch, i), dotMaterialFor?.(ch, i)));
    i++;
  }
  return letters;
}
