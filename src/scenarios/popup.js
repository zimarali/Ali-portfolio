// A closed pop-up book drops onto the table, bulging a little. Its cover
// swings open and the paper letters fold up off the page one after another.
// Flourish: an origami bird flutters out from behind the spread, loops
// over the name and perches on the "A".
import * as THREE from 'three';
import { Scene } from './base.js';
import { paperTexture } from '../textures.js';
import { ease, span, wobble, lerp, catmull, TAU, clamp } from '../motion.js';

const PAGE = 0.04;
const DEPTH = 1.55;
const CLOSED = THREE.MathUtils.degToRad(13);
const OPEN = THREE.MathUtils.degToRad(102);
const COLORS = [0xd9483b, 0x2a6f97, 0xe9a23b, 0x3e7c59, 0xd9483b, 0x2a6f97, 0xe9a23b, 0x3e7c59];
const X = new THREE.Vector3(1, 0, 0);

function printedPage() {
  // Faint printed sunburst on the inside of the spread.
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f0e3';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(233,162,59,0.22)';
  g.lineWidth = 6;
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + (i / 25) * Math.PI;
    g.beginPath();
    g.moveTo(256, 256);
    g.lineTo(256 + Math.cos(a) * 600, 256 + Math.sin(a) * 600);
    g.stroke();
  }
  g.fillStyle = 'rgba(217,72,59,0.12)';
  g.beginPath();
  g.arc(256, 256, 70, Math.PI, 0);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBird(track) {
  const paper = track(new THREE.MeshStandardMaterial({ color: 0xe0503f, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }));
  const g = new THREE.Group();
  const tri = (a, b, c) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    geo.computeVertexNormals();
    return track(geo);
  };
  const body = new THREE.Group();
  const parts = [
    tri([-0.18, 0.02, 0], [0.12, 0.02, 0], [0, -0.07, 0.05]),
    tri([-0.18, 0.02, 0], [0.12, 0.02, 0], [0, -0.07, -0.05]),
    tri([0.08, 0.02, 0], [0.22, 0.17, 0], [0.12, -0.02, 0.02]), // neck
    tri([0.22, 0.17, 0], [0.29, 0.13, 0], [0.2, 0.13, 0.01]), // beak
    tri([-0.12, 0.02, 0], [-0.3, 0.16, 0], [-0.16, -0.02, 0.02]), // tail
  ];
  for (const p of parts) { const m = new THREE.Mesh(p, paper); m.castShadow = true; body.add(m); }
  const wings = [1, -1].map((side) => {
    const w = new THREE.Group();
    w.position.set(-0.02, 0.025, 0);
    const m = new THREE.Mesh(tri([-0.09, 0, 0], [0.08, 0, 0], [-0.04, 0, side * 0.3]), paper);
    m.castShadow = true;
    w.add(m);
    w.userData.side = side;
    body.add(w);
    return w;
  });
  g.add(body);
  g.scale.setScalar(1.7);
  return { group: g, body, wings };
}

export class Popup extends Scene {
  static id = 'popup';
  static tracking = 0.08;
  title = 'Pop-up book';
  idleEvery = 10;
  look = {
    background: 0xece6da, floor: 0xe6dfd0, sky: 0xfffaf0, ground: 0xb7a98f, hemi: 1.05,
    key: 0xfff2dc, keyIntensity: 2.5, keyDir: [-0.6, 1, 0.8], fill: 0xdfe6ff, fillIntensity: 0.5, rimIntensity: 0.7,
    env: 0.3, shadow: 0x3a3226,
  };
  letterStyle = { depth: 0.14, bevel: 0.01, bevelSpread: 1, bevelSegments: 1 };
  framing = { elevation: 15, lift: 0.15 };

  material(ch, i) {
    this.fibre ??= this.track(paperTexture());
    return new THREE.MeshStandardMaterial({ color: COLORS[i], roughness: 0.92, bumpMap: this.fibre, bumpScale: 0.6 });
  }

  build() {
    const L = this.letters;
    for (const l of L) l.rest.position.y = PAGE;
    const cover = this.track(new THREE.MeshStandardMaterial({ color: 0x2d3142, roughness: 0.8 }));
    const edge = this.track(new THREE.MeshStandardMaterial({ color: 0xf1ead9, roughness: 0.9 }));
    const inside = this.track(new THREE.MeshStandardMaterial({ map: this.track(printedPage()), roughness: 0.9 }));
    const plain = this.track(new THREE.MeshStandardMaterial({ color: 0xf6f0e3, roughness: 0.9 }));
    const spine = this.track(new THREE.MeshStandardMaterial({ color: 0xc1452f, roughness: 0.7 }));

    this.books = this.layout.rows.map((row, r) => {
      const w = row.xMax - row.xMin + 1.1;
      const crease = row.z - L[row.indices[0]].size.z / 2 - 0.01;
      const book = new THREE.Group();
      book.position.set((row.xMin + row.xMax) / 2, 0, crease);
      this.add(book);
      const front = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, PAGE, DEPTH)), [edge, edge, plain, cover, edge, edge]);
      front.position.set(0, PAGE / 2, DEPTH / 2);
      front.receiveShadow = front.castShadow = true;
      const hinge = new THREE.Group();
      hinge.position.y = PAGE;
      // A front row keeps its backdrop low so it never hides the row behind.
      const tall = r === this.layout.rows.length - 1 && r > 0 ? 1.15 : DEPTH;
      const back = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, PAGE, tall)), [edge, edge, cover, inside, edge, edge]);
      back.position.set(0, PAGE / 2, tall / 2);
      back.castShadow = back.receiveShadow = true;
      hinge.add(back);
      const band = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.05, 0.05, w + 0.01, 16)), spine);
      band.rotation.z = Math.PI / 2;
      band.position.y = PAGE / 2;
      book.add(front, hinge, band);
      this.addBlob(front, { strength: 0.8 });
      const rect = { x0: book.position.x - w / 2, x1: book.position.x + w / 2, z0: crease, z1: crease + DEPTH };
      return { book, hinge, back, row, rect, delay: r * 0.12 };
    });

    // Letters fold up in a ripple from the centre outwards.
    const cx = (this.layout.box.min.x + this.layout.box.max.x) / 2;
    this.rise = L.map((l) => 0.95 + Math.abs(l.slot.x - cx) * 0.09 + l.slot.row * 0.1);
    this.rise.forEach((t, i) => this.sfx(t + 0.25, 'paper', { pitch: 0.9 + i * 0.05 }));
    this.sfx(0.42, 'thud', { pitch: 1.2 });
    this.sfx(0.75, 'paper', { pitch: 0.6, gain: 1.4 });

    // The bird.
    this.bird = buildBird((x) => this.track(x));
    this.add(this.bird.group);
    this.addBlob(this.bird.body, { strength: 0.5, scale: 0.8 });
    const A = L.find((l) => l.char === 'A');
    this.perch = new THREE.Vector3(A.slot.x + 0.02, PAGE + A.size.y + 0.07, A.slot.z);
    const b = this.layout.box;
    const midZ = this.layout.rows[0].z;
    this.flight = [
      new THREE.Vector3(cx + 0.4, 0.4, midZ - 1.2),
      new THREE.Vector3(cx + 0.6, 2.0, midZ - 0.9),
      new THREE.Vector3(b.max.x - 0.2, 1.9, midZ + 0.6),
      new THREE.Vector3(cx, 1.65, b.max.z + 0.4),
      new THREE.Vector3(b.min.x + 0.6, 1.8, midZ + 0.3),
      new THREE.Vector3(this.perch.x - 0.7, this.perch.y + 0.5, this.perch.z + 0.2),
      this.perch.clone(),
    ];
    this.flyFrom = 2.05;
    this.flyFor = 2.05;
    this.duration = this.flyFrom + this.flyFor + 0.45;
    this.sfx(this.flyFrom + 0.1, 'paper', { pitch: 1.6 });
    this.sfx(this.flyFrom + this.flyFor, 'chirp', { pitch: 1.3 });

    this.pokeables = [{ object: this.bird.group, onPoke: () => this.flutter() }];
    this.bird.group.userData.pokeable = this.pokeables[0];
  }

  groundAt(x, z) {
    for (const { rect: r, book } of this.books) {
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return PAGE + book.position.y;
    }
    return 0;
  }

  frameBox() {
    const b = this.layout.box.clone();
    b.max.y = Math.max(b.max.y, 1.3);
    return b;
  }

  pose(t) {
    // Drop in, then the cover opens.
    for (const bk of this.books) {
      const tt = t - bk.delay;
      const drop = tt < 0.42 ? 3 * (1 - ease.inQuad(span(tt, 0, 0.42))) : 0.05 * wobble((tt - 0.42) * 1.2, 1.5, 5);
      bk.book.position.y = Math.max(0, drop);
      const open = ease.inOutCubic(span(tt, 0.7, 1.15));
      bk.alpha = lerp(CLOSED, OPEN, open) + 0.05 * wobble(tt - 1.85, 1.4, 4);
      bk.hinge.rotation.x = -bk.alpha;
    }
    this.letters.forEach((l, i) => {
      const bk = this.books[l.slot.row] ?? this.books[0];
      // Each letter is tied to the spread: flat when closed, upright once open.
      const follow = clamp(1 - (bk.alpha - CLOSED) / (Math.PI / 2 - CLOSED));
      const own = 1 - ease.outBack(span(t, this.rise[i], 0.42), 2.6);
      const beta = (Math.PI / 2) * Math.max(follow, own);
      const th = l.size.z / 2;
      const E = new THREE.Vector3(l.slot.x, PAGE + bk.book.position.y, l.slot.z - th);
      l.root.position.copy(E).add(new THREE.Vector3(0, 0, th).applyAxisAngle(X, beta));
      l.root.rotation.set(beta, 0, 0);
    });
    this.poseBird(t);
  }

  poseBird(t) {
    const { group, body, wings } = this.bird;
    const u = span(t, this.flyFrom, this.flyFor);
    group.visible = t > this.flyFrom;
    const e = ease.inOutSine(u);
    const p = catmull(this.flight, e);
    const q = catmull(this.flight, Math.min(1, e + 0.02));
    group.position.set(p.x, p.y, p.z);
    const a = catmull(this.flight, 0.97), b = catmull(this.flight, 0.995);
    const landYaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    group.rotation.y = u < 1
      ? Math.atan2(-(q.z - p.z), q.x - p.x)
      : lerp(landYaw, -0.5, ease.inOutCubic(span(t, this.flyFrom + this.flyFor, 0.35)));
    body.rotation.z = u < 1 ? clamp((q.y - p.y) * 6, -0.4, 0.4) : 0;
    const flap = u < 0.85 ? Math.sin(t * 30) * 0.9 : u < 1 ? Math.sin(t * 14) * 0.5 : 0;
    const fold = ease.outCubic(span(t, this.flyFrom + this.flyFor, 0.3));
    for (const w of wings) w.rotation.x = w.userData.side * (flap * (1 - fold) - 0.15 - fold * 0.95);
    const land = t - this.flyFrom - this.flyFor;
    const sq = land > 0 ? 1 - 0.18 * Math.exp(-9 * land) * Math.cos(TAU * 2.4 * land) : 1;
    body.scale.set(1, sq, 1);
  }

  settle() {
    this.pose(this.duration);
  }

  /** Paper letters fold toward you and pop back, like turning the page. */
  react(letter) {
    const k = this.reduced ? 0.3 : 1;
    const th = letter.size.z / 2;
    this.play(letter, 0.85, (p) => {
      const b = (p < 0.4 ? Math.sin((Math.PI / 2) * (p / 0.4)) * 1.15 : 1.15 * (1 - ease.outBack(span(p, 0.4, 0.6), 2.4))) * k;
      letter.body.rotation.x = b;
      letter.body.position.set(0, 0, -th).add(new THREE.Vector3(0, 0, th).applyAxisAngle(X, b));
    });
    this.ctx.sound.play('paper', { pitch: 1.1 });
    this.ctx.sound.play('paper', { pitch: 1.4, delay: 0.38 });
    if (letter.char === 'A') this.flutter();
  }

  flutter() {
    const { group, body, wings } = this.bird;
    const y0 = this.perch.y;
    this.animate(1.0, (u) => {
      group.position.y = y0 + Math.sin(Math.PI * span(u, 0, 0.7)) * 0.4;
      const f = u < 0.75 ? Math.sin(u * 60) * 0.9 : 0;
      const fold = ease.outCubic(span(u, 0.75, 0.25));
      for (const w of wings) w.rotation.x = w.userData.side * (f * (1 - fold) - 0.15 - fold * 0.95);
      body.rotation.y = 0.4 * wobble(u, 1.5, 4);
    });
    this.ctx.sound.play('chirp', { pitch: 1.2 + Math.random() * 0.3 });
  }

  idle() {
    const { body, wings } = this.bird;
    this.animate(0.8, (u) => {
      body.rotation.y = 0.35 * Math.sin(Math.PI * u);
      for (const w of wings) w.rotation.x = w.userData.side * (-1.1 + 0.4 * Math.sin(Math.PI * span(u, 0.3, 0.4)));
    });
  }
}
