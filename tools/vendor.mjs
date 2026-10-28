// Bundles three.js (plus the few addons we use) into one minified ES module
// in vendor/, so the site stays a plain static page with no build step.
import { build } from 'esbuild';

await build({
  stdin: {
    contents: `
      export * from 'three';
      export { Font } from 'three/addons/loaders/FontLoader.js';
      export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
      export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
    `,
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  minify: true,
  legalComments: 'inline',
  target: 'es2020',
  outfile: 'vendor/three.min.js',
});
console.log('vendor/three.min.js written');
