// Picks a rendering tier from what the device tells us, then lets the
// stage step down at runtime if frames turn out slow.

export const TIERS = {
  high: { name: 'high', maxDpr: 2, shadows: true, shadowMap: 2048, antialias: true, curve: 10, bevelSegments: 5 },
  medium: { name: 'medium', maxDpr: 1.5, shadows: true, shadowMap: 1024, antialias: true, curve: 8, bevelSegments: 4 },
  low: { name: 'low', maxDpr: 1, shadows: false, shadowMap: 512, antialias: false, curve: 6, bevelSegments: 3 },
};

export function pickTier() {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced && TIERS[forced]) return TIERS[forced];
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (cores <= 2 || memory <= 2) return TIERS.low;
  if (coarse || cores <= 4) return TIERS.medium;
  return TIERS.high;
}

export const downgrade = (tier) => (tier.name === 'high' ? TIERS.medium : TIERS.low);

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}
