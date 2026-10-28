// The stage: renderer, studio lighting, tabletop, camera framing and an
// on-demand render loop that sleeps whenever nothing is moving.
import * as THREE from 'three';
import { RoomEnvironment } from 'three';
import { clamp } from './motion.js';

let blobTexture;
/** Soft radial texture used for contact shadows under objects. */
export function blobShadowTexture() {
  if (blobTexture) return blobTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  blobTexture = new THREE.CanvasTexture(c);
  return blobTexture;
}

export class Stage {
  constructor(canvas, tier) {
    this.canvas = canvas;
    this.tier = tier;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.antialias, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffffff, 20, 60);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    this.cameraBase = new THREE.Vector3(0, 3, 12);
    this.cameraTarget = new THREE.Vector3(0, 0.5, 0);
    this.cameraOffset = new THREE.Vector2();

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.2);
    this.key = new THREE.DirectionalLight(0xffffff, 2.4);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 5;
    this.fill = new THREE.DirectionalLight(0xffffff, 0.6);
    this.rim = new THREE.DirectionalLight(0xffffff, 0.9);
    this.scene.add(this.hemi, this.key, this.key.target, this.fill, this.rim);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.onTick = () => false;
    this.raf = 0;
    this.last = 0;
    this.slowFrames = 0;
    this.onSlow = null;
    this.loop = this.loop.bind(this);
    this.applyTier(tier);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.sleep();
      else this.wake();
    });
  }

  applyTier(tier) {
    this.tier = tier;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.maxDpr));
    this.renderer.shadowMap.enabled = tier.shadows;
    this.key.castShadow = tier.shadows;
    this.key.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  /** Each scene brings its own palette; the room stays the same. */
  setLook(look) {
    const bg = new THREE.Color(look.background);
    this.scene.background = bg;
    this.scene.fog.color.copy(bg);
    this.floor.material.color.set(look.floor ?? look.background);
    this.floor.material.roughness = look.floorRoughness ?? 0.92;
    this.floor.material.map = look.floorMap ?? null;
    // A slightly see-through floor lets a scene fake wet reflections beneath it.
    this.floor.material.transparent = (look.floorOpacity ?? 1) < 1;
    this.floor.material.opacity = look.floorOpacity ?? 1;
    this.floor.material.metalness = look.floorMetalness ?? 0;
    this.floor.material.needsUpdate = true;
    this.hemi.color.set(look.sky ?? 0xffffff);
    this.hemi.groundColor.set(look.ground ?? look.floor ?? 0x777777);
    this.hemi.intensity = look.hemi ?? 1.1;
    this.key.color.set(look.key ?? 0xfff3e2);
    this.key.intensity = look.keyIntensity ?? 2.4;
    this.fill.color.set(look.fill ?? 0xdde8ff);
    this.fill.intensity = look.fillIntensity ?? 0.5;
    this.rim.color.set(look.rim ?? 0xffffff);
    this.rim.intensity = look.rimIntensity ?? 0.9;
    this.scene.environmentIntensity = look.env ?? 0.55;
    this.renderer.toneMappingExposure = look.exposure ?? 1;
    this.lightDir = look.keyDir ?? [-0.55, 1, 0.65];
    this.placeLights();
  }

  /** Frames the name's bounding box so it reads well at any aspect ratio. */
  frame(box, { elevation, tallElevation = 36, fill, fillY = 0.6, lift = 0 } = {}) {
    this.box = box.clone();
    const aspect = this.aspect;
    const tall = aspect < 0.9;
    // Tall screens look down more steeply so the two rows separate.
    elevation = tall ? Math.max(elevation ?? 0, tallElevation) : elevation ?? 13;
    fill ??= tall ? 0.86 : 0.74;
    const center = box.getCenter(new THREE.Vector3());
    center.y = box.max.y * 0.42 + lift;
    const dir = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(elevation)), Math.cos(THREE.MathUtils.degToRad(elevation)));
    const cam = this.camera;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    // Binary-search the distance at which the box just fits the viewport.
    let lo = 2, hi = 120;
    const v = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(center).addScaledVector(dir, d);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      let fits = true;
      for (const c of corners) {
        v.copy(c).project(cam);
        if (Math.abs(v.x) > fill || Math.abs(v.y) > fillY) { fits = false; break; }
      }
      if (fits) hi = d; else lo = d;
    }
    this.distance = hi;
    this.cameraTarget.copy(center);
    this.cameraBase.copy(center).addScaledVector(dir, hi);
    // Fog only begins behind the name, so it melts the horizon, never the letters.
    const depth = box.getSize(new THREE.Vector3()).length();
    this.scene.fog.near = hi + depth * 0.6 + 1;
    this.scene.fog.far = hi * 2.7 + depth;
    this.placeLights();
    this.updateCamera();
  }

  placeLights() {
    if (!this.box) return;
    const c = this.box.getCenter(new THREE.Vector3());
    const r = Math.max(4, this.box.getSize(new THREE.Vector3()).length() * 0.75 + 2.5);
    const [dx, dy, dz] = this.lightDir ?? [-0.55, 1, 0.65];
    this.key.position.set(c.x + dx * 10, dy * 10, c.z + dz * 10);
    this.key.target.position.copy(c);
    const sc = this.key.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 30;
    sc.updateProjectionMatrix();
    this.fill.position.set(c.x + 8, 3, c.z + 6);
    this.rim.position.set(c.x + 2, 5, c.z - 9);
  }

  /** Subtle parallax: the camera drifts a touch with the pointer. */
  setCameraOffset(x, y) { this.cameraOffset.set(x, y); this.updateCamera(); }

  updateCamera() {
    const cam = this.camera;
    const d = this.distance ?? 12;
    cam.position.copy(this.cameraBase);
    cam.position.x += this.cameraOffset.x * d * 0.035;
    cam.position.y += this.cameraOffset.y * d * 0.02;
    cam.lookAt(this.cameraTarget);
  }

  get aspect() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    return r.width / Math.max(1, r.height);
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
    this.wake();
  }

  wake() {
    if (this.raf || document.hidden) return;
    clearTimeout(this.ambientTimer);
    this.ambientTimer = 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  sleep() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.ambientTimer);
    this.raf = 0;
    this.ambientTimer = 0;
  }

  /**
   * onTick returns true (animate at full rate), 'ambient' (only background
   * life is moving: tick at a gentle ~24 fps) or false (sleep).
   */
  loop(now) {
    const raw = (now - this.last) / 1000;
    const dt = clamp(raw, 0, 1 / 30);
    this.last = now;
    const active = this.onTick(dt);
    this.renderer.render(this.scene, this.camera);
    this.watchPerformance(raw, active === true);
    this.raf = active === true ? requestAnimationFrame(this.loop) : 0;
    if (active === 'ambient') this.ambientTimer = setTimeout(() => { this.ambientTimer = 0; this.wake(); }, 1000 / 24);
  }

  /** Steps quality down if the device keeps missing frames while animating. */
  watchPerformance(raw, active) {
    if (!active || raw > 0.25 || this.tier.name === 'low') { this.slowFrames = Math.max(0, this.slowFrames - 1); return; }
    this.slowFrames += raw > 1 / 38 ? 1 : -0.5;
    if (this.slowFrames > 70) { this.slowFrames = 0; this.onSlow?.(); }
  }

  dispose() {
    this.sleep();
    this.renderer.dispose();
  }
}
