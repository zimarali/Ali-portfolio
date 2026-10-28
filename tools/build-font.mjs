// Converts the few Fredoka glyphs the name needs into three.js "typeface"
// JSON (the format Font from three/addons expects). Run: npm run font
// Usage: node tools/build-font.mjs [weight] [chars]
import fs from 'node:fs';
import opentype from 'opentype.js';

const weight = process.argv[2] || '600';
const chars = process.argv[3] || 'Ramiz Ali';
const src = `node_modules/@fontsource/fredoka/files/fredoka-latin-${weight}-normal.woff`;
const buf = fs.readFileSync(src);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const r = (n) => Math.round(n);
const glyphs = {};
for (const ch of new Set(chars)) {
  const g = font.charToGlyph(ch);
  const o = g.path.commands.map((c) => {
    switch (c.type) {
      case 'M': return `m ${r(c.x)} ${r(c.y)}`;
      case 'L': return `l ${r(c.x)} ${r(c.y)}`;
      case 'Q': return `q ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)}`;
      case 'C': return `b ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)}`;
      default: return '';
    }
  }).filter(Boolean).join(' ');
  const bb = g.getBoundingBox();
  glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.x1), x_max: r(bb.x2), o };
}

const out = {
  glyphs,
  familyName: `Fredoka ${weight}`,
  ascender: font.ascender,
  descender: font.descender,
  underlinePosition: font.tables.post.underlinePosition,
  underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { yMin: font.tables.head.yMin, xMin: font.tables.head.xMin, yMax: font.tables.head.yMax, xMax: font.tables.head.xMax },
  resolution: font.unitsPerEm,
  original_font_information: { license: 'SIL Open Font License 1.1 — Fredoka by Milena Brandão' },
};
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/name-font.json', JSON.stringify(out));
console.log('assets/name-font.json', Object.keys(glyphs).join(''), fs.statSync('assets/name-font.json').size, 'bytes');
