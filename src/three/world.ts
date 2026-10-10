/*
  OrbitWorld — the whole voyage as plain three.js objects.
  React Three Fiber owns the canvas, the render loop and render-on-demand;
  this class owns the content, so per-frame work is plain mutation with no
  React involvement and no allocations.

  Layout (world units, Earth radius = 1):
    Earth (0,0,0) · Moon (3,0.7,-7.5) · cruiser (5.2,1.3,-26) · Mars (6,0.4,-72)
  The sun is infinitely far away along SUN_DIR.
*/
import * as THREE from "three";
import type { QualitySettings } from "@/lib/quality";
import { flight, SHOT_COUNT } from "@/lib/flight";
import {
  atmosphereFrag,
  bakeVertex,
  billboardVertex,
  earthDataFrag,
  earthFrag,
  earthSurfaceFrag,
  glowFrag,
  planetVertex,
  rockyBakeFrag,
  rockyFrag,
  skyBakeFrag,
  skyFrag,
  skyVertex,
  starsFrag,
  starsVertex,
  streaksFrag,
  streaksVertex,
} from "./shaders";

const SUN_DIR = new THREE.Vector3(1, 0.25, -0.35).normalize();
const BAND = new THREE.Vector3(0.3, 0.9, 0.3).normalize(); // milky-way plane normal
const EARTH = new THREE.Vector3(0, 0, 0);
const MOON = new THREE.Vector3(3, 0.7, -7.5);
const SHIP = new THREE.Vector3(5.2, 1.3, -26);
const MARS = new THREE.Vector3(6, 0.4, -72);
const MARS_R = 0.9;

type V3 = [number, number, number];
type Shot = { pos: V3; look: V3; pPos: V3; pLook: V3 };

/* One shot per page section: landscape framing keeps the subject right of the
   text column; portrait framing puts it low and central under the text. */
const SHOTS: Shot[] = [
  // 0 hero — Earth crescent, city lights on the night side
  { pos: [-0.35, 0.3, 3.1], look: [-1.05, 0.12, 0], pPos: [0.15, 0.2, 3.7], pLook: [0, 0.95, 0] },
  // 1 route — rising over the Earth's limb, the Moon ahead
  { pos: [0.6, 1.25, 1.6], look: [1.2, -0.2, -7.5], pPos: [0.8, 1.45, 2.1], pLook: [2.4, 0.3, -7.5] },
  // 2 ship — alongside the cruiser
  { pos: [4.0, 1.75, -23.6], look: [4.6, 1.3, -26.5], pPos: [4.5, 2.05, -22.6], pLook: [5.2, 0.95, -26] },
  // 3 aboard — the long coast, Mars a red spark ahead
  { pos: [4.6, 1.2, -42], look: [5.0, 0.6, -72], pPos: [4.8, 1.3, -44], pLook: [5.8, 0.75, -72] },
  // 4 mars — close approach on the day side
  { pos: [7.6, 0.9, -69.7], look: [5.43, 0.4, -71.6], pPos: [7.9, 0.6, -68.9], pLook: [6, 1.0, -72] },
  // 5 fares — wide orbit with Phobos
  { pos: [9.4, 2.0, -70], look: [7.0, 0.5, -71.2], pPos: [10.2, 2.6, -68.6], pLook: [6.2, 0.9, -72] },
];

const v = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
const curve = (pts: V3[]) => new THREE.CatmullRomCurve3(pts.map(v), false, "centripetal");

/** Give the browser a chance to handle input / paint between heavy steps. */
export function yieldToMain(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched?.yield) return sched.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ---------------- GPU bake ---------------- */
function bake(
  renderer: THREE.WebGLRenderer,
  width: number,
  frag: string,
  uniforms: Record<string, THREE.IUniform> = {},
  mipmaps = true,
) {
  const rt = new THREE.WebGLRenderTarget(width, width / 2, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    generateMipmaps: mipmaps,
    minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  rt.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.ShaderMaterial({ vertexShader: bakeVertex, fragmentShader: frag, uniforms, depthTest: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  quad.geometry.dispose();
  mat.dispose();
  return rt;
}

/* ---------------- small factories ---------------- */
function glowSprite(color: THREE.Color, size: number, core: number, intensity: number) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: billboardVertex,
    fragmentShader: glowFrag,
    uniforms: {
      uColor: { value: color },
      uSize: { value: size },
      uCore: { value: core },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.frustumCulled = false;
  return mesh;
}

function atmosphereShell(radius: number, scale: number, color: THREE.Color, sunset: THREE.Color, intensity: number) {
  const inner = Math.sqrt(1 - 1 / (scale * scale)); // where the planet's limb sits inside the shell
  const mat = new THREE.ShaderMaterial({
    vertexShader: planetVertex,
    fragmentShader: atmosphereFrag,
    uniforms: {
      uSun: { value: SUN_DIR },
      uColor: { value: color },
      uSunset: { value: sunset },
      uInner: { value: inner },
      uIntensity: { value: intensity },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * scale, 96, 48), mat);
}

/** A seeded random generator, so the layout is identical on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildShip(): { group: THREE.Group; ring: THREE.Group } {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: "#c9ccd2", metalness: 0.25, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: "#3a3f4b", metalness: 0.3, roughness: 0.6 });
  const panel = new THREE.MeshStandardMaterial({
    color: "#1c2c52",
    metalness: 0.4,
    roughness: 0.3,
    emissive: "#081226",
  });
  const gold = new THREE.MeshStandardMaterial({ color: "#c79a4a", metalness: 0.5, roughness: 0.35 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    group.add(m);
    return m;
  };
  const H = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.05, 0.05, 1.35, 12), hull, 0, 0, 0, H);           // spine
  add(new THREE.CylinderGeometry(0.12, 0.1, 0.32, 20), hull, 0, 0, -0.58, H);        // forward module
  const dome = add(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, H), dark, 0, 0, -0.74, -H);
  dome.scale.set(1, 0.9, 1);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 14), gold, 0.11, 0, 0.18, H);    // tanks
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 14), gold, -0.11, 0, 0.18, H);
  add(new THREE.ConeGeometry(0.11, 0.22, 20, 1, true), dark, 0, 0, 0.76, -H);        // engine bell
  add(new THREE.BoxGeometry(0.008, 0.5, 0.18), hull, 0, 0.0, 0.42);                  // radiator
  // solar wings with a truss
  add(new THREE.BoxGeometry(1.5, 0.012, 0.012), dark, 0, 0, 0.36);
  add(new THREE.BoxGeometry(0.62, 0.006, 0.24), panel, 0.48, 0, 0.36);
  add(new THREE.BoxGeometry(0.62, 0.006, 0.24), panel, -0.48, 0, 0.36);

  // habitat ring: spins around the ship's axis
  const ring = new THREE.Group();
  ring.position.z = -0.2;
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 12, 72), hull);
  ring.add(torus);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.84, 0.022), dark);
    spoke.rotation.z = (i * Math.PI) / 3;
    ring.add(spoke);
  }
  const windows = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.047, 4, 72, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: "#ffd9a0", wireframe: true, transparent: true, opacity: 0.12 }),
  );
  ring.add(windows);
  ring.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16).rotateX(H), hull)); // hub
  group.add(ring);

  const engine = glowSprite(new THREE.Color(0.45, 0.65, 1.0), 0.55, 0.08, 0.9);
  engine.position.set(0, 0, 0.9);
  group.add(engine);
  const beacon = glowSprite(new THREE.Color(1.0, 0.45, 0.25), 0.12, 0.2, 1.2);
  beacon.position.set(0.79, 0, 0.36);
  group.add(beacon);
  return { group, ring };
}

function buildPhobos() {
  const geo = new THREE.IcosahedronGeometry(0.075, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n = p.clone().normalize();
    const lump =
      1 + 0.18 * Math.sin(n.x * 3.1 + 1.2) * Math.cos(n.y * 2.3) + 0.08 * Math.sin(n.z * 7.3 + n.x * 5.1) - 0.05 * Math.abs(Math.sin(n.y * 11.0));
    p.multiplyScalar(lump);
    p.x *= 1.35;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#6f6156", roughness: 1, metalness: 0 }));
}

/* ======================================================================= */

export type FrameMode = "continuous" | "ambient" | "idle";

export class OrbitWorld {
  readonly root = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  private renderTargets: THREE.WebGLRenderTarget[] = [];

  private earthSpin = new THREE.Group();
  private marsSpin = new THREE.Group();
  private moon: THREE.Mesh;
  private phobos: THREE.Mesh;
  private ring: THREE.Group;
  private sky = new THREE.Group();
  private earthMat: THREE.ShaderMaterial;
  private starsMat: THREE.ShaderMaterial;
  private streaksMat: THREE.ShaderMaterial;

  private landscape: { pos: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3 };
  private portrait: { pos: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3 };
  private isPortrait = false;
  private aspect = 0;

  private current = 0;
  private time = 0;
  private first = true;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly trail = new THREE.Vector3();
  private readonly trailTarget = new THREE.Vector3();

  /**
   * Builds the world in slices so no single task blocks the main thread for long:
   * each GPU bake (a shader compile + a full-screen draw) gets its own task.
   * Returns null when `alive()` turns false part-way (the canvas unmounted).
   */
  static async create(
    renderer: THREE.WebGLRenderer,
    q: QualitySettings,
    reduced: boolean,
    alive: () => boolean,
  ): Promise<OrbitWorld | null> {
    const made: THREE.WebGLRenderTarget[] = [];
    const step = async <T extends THREE.WebGLRenderTarget>(make: () => T): Promise<T | null> => {
      await yieldToMain();
      if (!alive()) return null;
      const rt = make();
      made.push(rt);
      return rt;
    };
    const abort = () => {
      made.forEach((rt) => rt.dispose());
      return null;
    };

    /* ---- bake the planets and the sky ---- */
    const earthSurface = await step(() => bake(renderer, q.bake, earthSurfaceFrag));
    if (!earthSurface) return abort();
    const earthData = await step(() => bake(renderer, q.bake, earthDataFrag));
    if (!earthData) return abort();
    const marsMap = await step(() =>
      bake(renderer, q.marsBake, rockyBakeFrag, {
        uDark: { value: new THREE.Color(0.15, 0.05, 0.022) },
        uBase: { value: new THREE.Color(0.48, 0.15, 0.05) },
        uBright: { value: new THREE.Color(0.68, 0.33, 0.16) },
        uCap: { value: 1 },
        uCanyon: { value: 1 },
        uCraters: { value: 0.7 },
        uMaria: { value: 0.85 },
        uSeed: { value: 4.2 },
      }),
    );
    if (!marsMap) return abort();
    const moonMap = await step(() =>
      bake(renderer, 512, rockyBakeFrag, {
        uDark: { value: new THREE.Color(0.07, 0.07, 0.075) },
        uBase: { value: new THREE.Color(0.26, 0.25, 0.24) },
        uBright: { value: new THREE.Color(0.42, 0.41, 0.4) },
        uCap: { value: 0 },
        uCanyon: { value: 0 },
        uCraters: { value: 1.4 },
        uMaria: { value: 1 },
        uSeed: { value: 11.7 },
      }),
    );
    if (!moonMap) return abort();
    const skyMap = await step(() => bake(renderer, 1024, skyBakeFrag, { uBand: { value: BAND } }, false));
    if (!skyMap) return abort();

    await yieldToMain();
    if (!alive()) return abort();
    return new OrbitWorld({ earthSurface, earthData, marsMap, moonMap, skyMap }, q, reduced);
  }

  private constructor(
    maps: Record<"earthSurface" | "earthData" | "marsMap" | "moonMap" | "skyMap", THREE.WebGLRenderTarget>,
    private q: QualitySettings,
    private reduced: boolean,
  ) {
    const { earthSurface, earthData, marsMap, moonMap, skyMap } = maps;
    this.renderTargets.push(earthSurface, earthData, marsMap, moonMap, skyMap);

    /* ---- Earth: tilted axis, spinning surface, clouds drift in the shader ---- */
    const earthTilt = new THREE.Group();
    earthTilt.rotation.z = 0.41;
    earthTilt.position.copy(EARTH);
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: planetVertex,
      fragmentShader: earthFrag,
      uniforms: {
        uSurface: { value: earthSurface.texture },
        uData: { value: earthData.texture },
        uSun: { value: SUN_DIR },
        uCloud: { value: 0 },
      },
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), this.earthMat);
    this.earthSpin.add(earth);
    this.earthSpin.rotation.y = 2.2;
    earthTilt.add(this.earthSpin);
    this.root.add(earthTilt);
    const earthAtm = atmosphereShell(1, 1.1, new THREE.Color(0.22, 0.5, 1.0), new THREE.Color(1.0, 0.5, 0.25), 0.9);
    earthAtm.position.copy(EARTH);
    this.root.add(earthAtm);

    /* ---- Moon ---- */
    const rockyMat = (map: THREE.Texture, width: number, atm: THREE.Color, atmAmt: number, bump: number) =>
      new THREE.ShaderMaterial({
        vertexShader: planetVertex,
        fragmentShader: rockyFrag,
        uniforms: {
          uMap: { value: map },
          uSun: { value: SUN_DIR },
          uAtm: { value: atm },
          uAtmAmt: { value: atmAmt },
          uTexel: { value: new THREE.Vector2(1 / width, 2 / width) },
          uBump: { value: width * bump },
        },
      });
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 64, 32),
      rockyMat(moonMap.texture, 512, new THREE.Color(0, 0, 0), 0, 0.06),
    );
    this.moon.position.copy(MOON);
    this.root.add(this.moon);

    /* ---- Mars + Phobos ---- */
    const marsTilt = new THREE.Group();
    marsTilt.position.copy(MARS);
    marsTilt.rotation.z = -0.44;
    const mars = new THREE.Mesh(
      new THREE.SphereGeometry(MARS_R, 128, 64),
      rockyMat(marsMap.texture, q.marsBake, new THREE.Color(0.9, 0.5, 0.34), 0.5, 0.022),
    );
    this.marsSpin.add(mars);
    this.marsSpin.rotation.y = 3.6;
    marsTilt.add(this.marsSpin);
    this.root.add(marsTilt);
    const marsAtm = atmosphereShell(MARS_R, 1.05, new THREE.Color(0.95, 0.55, 0.38), new THREE.Color(0.55, 0.62, 0.9), 0.9);
    marsAtm.position.copy(MARS);
    this.root.add(marsAtm);
    this.phobos = buildPhobos();
    this.root.add(this.phobos);

    /* ---- the cruiser ---- */
    const ship = buildShip();
    ship.group.position.copy(SHIP);
    ship.group.rotation.set(0.08, -0.12, 0.18);
    this.ring = ship.ring;
    this.root.add(ship.group);

    /* ---- lights for the standard materials (ship, Phobos) ---- */
    const sun = new THREE.DirectionalLight("#fff3e2", 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(50);
    this.root.add(sun);
    this.root.add(sun.target);
    this.root.add(new THREE.HemisphereLight("#3a4a70", "#120a08", 0.12));

    /* ---- sky: nebula sphere, stars and sun all follow the camera (infinitely far) ---- */
    const skySphere = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFrag,
        uniforms: { uMap: { value: skyMap.texture } },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    skySphere.renderOrder = -3;
    this.sky.add(skySphere);

    const rand = rng(7);
    const n = q.stars;
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    const dir = new THREE.Vector3();
    const tA = new THREE.Vector3(1, 0, 0).cross(BAND).normalize();
    const tB = new THREE.Vector3().crossVectors(BAND, tA);
    const cool = new THREE.Color(0.65, 0.78, 1.0);
    const warm = new THREE.Color(1.0, 0.82, 0.6);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (rand() < 0.4) {
        // in the galactic band
        const a = rand() * Math.PI * 2;
        const off = (rand() + rand() + rand() - 1.5) * 0.18;
        dir.copy(tA).multiplyScalar(Math.cos(a)).addScaledVector(tB, Math.sin(a)).addScaledVector(BAND, off).normalize();
      } else {
        const z = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - z * z);
        dir.set(r * Math.cos(a), z, r * Math.sin(a));
      }
      positions.set([dir.x * 500, dir.y * 500, dir.z * 500], i * 3);
      const big = Math.pow(rand(), 6);
      sizes[i] = 1.1 + big * 3.4;
      const t = rand();
      col.copy(t < 0.5 ? cool : warm).lerp(new THREE.Color(1, 1, 1), t < 0.5 ? t * 2 * 0.6 : (1 - t) * 2 * 0.6);
      const b = 0.35 + rand() * 0.55 + big * 1.6;
      colors.set([col.r * b, col.g * b, col.b * b], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    this.starsMat = new THREE.ShaderMaterial({
      vertexShader: starsVertex,
      fragmentShader: starsFrag,
      uniforms: { uPR: { value: 1 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, this.starsMat);
    stars.renderOrder = -2;
    stars.frustumCulled = false;
    this.sky.add(stars);

    const sunGlow = glowSprite(new THREE.Color(1.0, 0.9, 0.75), 120, 0.05, 1.4);
    sunGlow.position.copy(SUN_DIR).multiplyScalar(600);
    sunGlow.renderOrder = -1;
    this.sky.add(sunGlow);
    this.root.add(this.sky);

    /* ---- camera curves ---- */
    this.landscape = { pos: curve(SHOTS.map((s) => s.pos)), look: curve(SHOTS.map((s) => s.look)) };
    this.portrait = { pos: curve(SHOTS.map((s) => s.pPos)), look: curve(SHOTS.map((s) => s.pLook)) };

    /* ---- flight streaks scattered around the route ---- */
    const m = q.streaks;
    const sPos = new Float32Array(m * 6);
    const sEnd = new Float32Array(m * 2);
    const sBright = new Float32Array(m * 2);
    const p = new THREE.Vector3();
    const off = new THREE.Vector3();
    let placed = 0;
    while (placed < m) {
      this.landscape.pos.getPoint(0.04 + rand() * 0.9, p);
      off.set(rand() * 2 - 1, (rand() * 2 - 1) * 0.6, rand() * 2 - 1).normalize().multiplyScalar(1.2 + rand() * 11);
      p.add(off);
      if (p.distanceTo(EARTH) < 1.4 || p.distanceTo(MARS) < MARS_R + 0.5) continue;
      sPos.set([p.x, p.y, p.z, p.x, p.y, p.z], placed * 6);
      sEnd.set([0, 1], placed * 2);
      const br = 0.25 + rand() * 0.75;
      sBright.set([br, br], placed * 2);
      placed++;
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    streakGeo.setAttribute("aEnd", new THREE.BufferAttribute(sEnd, 1));
    streakGeo.setAttribute("aBright", new THREE.BufferAttribute(sBright, 1));
    this.streaksMat = new THREE.ShaderMaterial({
      vertexShader: streaksVertex,
      fragmentShader: streaksFrag,
      uniforms: { uTrail: { value: this.trail }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const streaks = new THREE.LineSegments(streakGeo, this.streaksMat);
    streaks.frustumCulled = false;
    this.root.add(streaks);

    this.placePhobos();

    // collect everything that owns GPU memory
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) this.disposables.push(mesh.geometry);
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => this.disposables.push(x));
      else if (mat) this.disposables.push(mat);
    });
  }

  private placePhobos() {
    const a = 0.65 + this.time * 0.05;
    this.phobos.position.set(MARS.x + Math.cos(a) * 1.75, MARS.y + 0.35 + Math.sin(a) * 0.25, MARS.z + Math.sin(a) * 1.75);
    this.phobos.rotation.set(0.3, -a, 0.1);
  }

  /** Called every rendered frame. Returns what kind of frame loop is still needed. */
  update(camera: THREE.PerspectiveCamera, rawDt: number, width: number, height: number, pixelRatio: number): FrameMode {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);

    // framing: portrait screens get their own curves and a wider lens
    const aspect = width / Math.max(1, height);
    if (aspect !== this.aspect) {
      this.aspect = aspect;
      this.isPortrait = aspect < 0.85;
      camera.fov = this.isPortrait ? 58 : aspect < 1.3 ? 48 : 40;
      camera.near = 0.05;
      camera.far = 2000;
      camera.updateProjectionMatrix();
      this.first = true;
    }
    this.starsMat.uniforms.uPR.value = pixelRatio;

    // ONE smoothing layer: native scroll → exponential damping here
    const target = Math.min(SHOT_COUNT - 1, Math.max(0, flight.target));
    const before = this.current;
    if (this.reduced) {
      this.current = Math.round(target); // cut between shots, never sweep
    } else {
      this.current += (target - this.current) * (1 - Math.exp(-5.5 * dt));
      if (Math.abs(target - this.current) < 0.0004) this.current = target;
    }
    const moved = this.first || this.current !== before;

    if (moved) {
      const rig = this.isPortrait ? this.portrait : this.landscape;
      const i = Math.min(SHOT_COUNT - 2, Math.floor(this.current));
      const f = this.current - i;
      const eased = f + (f * f * (3 - 2 * f) - f) * 0.55; // linger on each shot
      const t = (i + eased) / (SHOT_COUNT - 1);
      rig.pos.getPoint(t, this.tmpPos);
      rig.look.getPoint(t, this.tmpLook);
      camera.position.copy(this.tmpPos);
      camera.lookAt(this.tmpLook);
    }

    // flight streaks: trail length follows the camera's speed
    if (!this.reduced && !this.first && dt > 0) {
      this.velocity.subVectors(camera.position, this.prevPos).divideScalar(Math.max(dt, 1 / 240));
      this.trailTarget.copy(this.velocity).multiplyScalar(0.045);
      const len = this.trailTarget.length();
      if (len > 3.5) this.trailTarget.multiplyScalar(3.5 / len);
    } else {
      this.trailTarget.set(0, 0, 0);
    }
    this.trail.lerp(this.trailTarget, 1 - Math.exp(-10 * dt));
    if (this.reduced) this.trail.set(0, 0, 0);
    const trailing = this.trail.lengthSq() > 1e-5;
    if (!trailing) this.trail.set(0, 0, 0);
    this.prevPos.copy(camera.position);
    this.first = false;

    // ambient life: planets turn, clouds drift, the ring spins
    if (!this.reduced) {
      this.time += dt;
      this.earthSpin.rotation.y += dt * 0.012;
      this.marsSpin.rotation.y += dt * 0.01;
      this.moon.rotation.y += dt * 0.004;
      this.earthMat.uniforms.uCloud.value = (this.earthMat.uniforms.uCloud.value + dt * 0.0012) % 1;
      this.ring.rotation.z += dt * 0.4;
      this.starsMat.uniforms.uTime.value = this.time;
      this.placePhobos();
    }

    this.sky.position.copy(camera.position);

    if (moved || trailing) return "continuous";
    return this.reduced ? "idle" : "ambient";
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.renderTargets.forEach((rt) => rt.dispose());
    this.disposables = [];
    this.renderTargets = [];
  }
}
