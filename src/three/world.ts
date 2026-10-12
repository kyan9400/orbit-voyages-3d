/*
  OrbitWorld — the whole voyage as plain three.js objects.
  React Three Fiber owns the canvas, the render loop and render-on-demand;
  this class owns the content, so per-frame work is plain mutation with no
  React involvement and no allocations.

  Layout (world units, Earth radius = 1):
    Earth (0,0,0) · Moon (3,0.7,-7.5) · cruiser (5.2,1.3,-26) · Mars (6,0.4,-72)
  The sun is infinitely far away along SUN_DIR.

  Signature moment: between shots 2 and 3 the cruiser fires its engine
  (trans-Mars injection). The ship rides along with the camera so the frame
  holds on it while a dolly zoom stretches space behind it, then it leaves
  toward Mars and shrinks to a spark. Burn and departure are pure functions
  of the smoothed shot position, so reduced motion (which cuts between whole
  shots) never shows a sweep.
*/
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { QualitySettings } from "@/lib/quality";
import { flight, SHOT_COUNT } from "@/lib/flight";
import { glowSprite, type GlowSprite } from "./glow";
import { buildShip, type Ship } from "./ship";
import {
  atmosphereFrag,
  bakeVertex,
  earthDataFrag,
  earthFrag,
  earthSurfaceFrag,
  flareFrag,
  flareVertex,
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
const MOON = new THREE.Vector3(1.8, 1.0, -7.8);
const SHIP = new THREE.Vector3(5.2, 1.3, -26);
const MARS = new THREE.Vector3(6, 0.4, -72);
const MARS_R = 0.9;
const SHIP_ROT = new THREE.Euler(0.08, -0.12, 0.18);
/* Hero: the same cruiser, parked in low orbit in the foreground of the sunrise (scaled down,
   silhouetted against the night side). It jumps to its deep-space station while the camera
   faces the Moon, so the swap is never on screen. */
const HERO_SHIP = { landscape: new THREE.Vector3(-0.992, 0.592, -0.288), portrait: new THREE.Vector3(-1.103, 0.612, 0.58) };
const HERO_HEADING = { landscape: new THREE.Vector3(0.853, 0.142, 0.503), portrait: new THREE.Vector3(0.748, 0.291, 0.596) };
const HERO_SCALE = { landscape: 0.06, portrait: 0.045 };
const INTRO_S = 1.8; // "lights on" after the canvas appears
const DEPART = 400; // how far ahead the ship has flown by shot 3 (it is hidden by then)

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

type V3 = [number, number, number];
type Shot = { pos: V3; look: V3; pPos: V3; pLook: V3 };

/* One shot per page section: landscape framing keeps the subject right of the
   text column; portrait framing puts it low and central under the text. */
const SHOTS: Shot[] = [
  // 0 hero — orbital sunrise: the night side and its cities fill the lower right, the sun breaks over the limb
  { pos: [-1.453, 0.605, -0.096], look: [1.095, 0.72, -1.677], pPos: [-1.68, 0.645, 0.805], pLook: [0.771, 1.789, -0.494] },
  // 1 route — lunar slingshot: close past the Moon, its terminator and craters filling the right of the frame
  { pos: [2.98, 1.34, -6.62], look: [1.51, 1.0, -7.51], pPos: [3.2, 1.9, -6.4], pLook: [1.8, 1.6, -7.8] },
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
/** 64³ random lattice for the bake shaders' value noise (built once, ~0.3 MB, freed after the bakes). */
function noiseLattice(): THREE.Data3DTexture {
  const N = 64;
  const data = new Uint8Array(N * N * N);
  const r = rng(1337);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(r() * 256);
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
let lattice: THREE.Data3DTexture | null = null;

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
  const mat = new THREE.ShaderMaterial({
    vertexShader: bakeVertex,
    fragmentShader: frag,
    uniforms: { ...uniforms, uNoise: { value: lattice } },
    depthTest: false,
  });
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
function atmosphereShell(
  center: THREE.Vector3,
  radius: number,
  scale: number,
  color: THREE.Color,
  sunset: THREE.Color,
  intensity: number,
) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: planetVertex,
    fragmentShader: atmosphereFrag,
    uniforms: {
      uSun: { value: SUN_DIR },
      uColor: { value: color },
      uSunset: { value: sunset },
      uCenter: { value: center },
      uRadius: { value: radius },
      uShell: { value: scale },
      uIntensity: { value: intensity },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * scale, 96, 48), mat);
  mesh.position.copy(center);
  return mesh;
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

/* Small deterministic value noise (JS) for Phobos' shape. */
function hash3(x: number, y: number, z: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), ux), lerp(c(0, 1, 0), c(1, 1, 0), ux), uy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), ux), lerp(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz,
  );
}

/** Phobos: three octaves of noise, two crater dimples (Stickney and a smaller one), welded smooth normals. */
function buildPhobos() {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.075, 5);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo, 1e-5);
  const craters = [
    { dir: new THREE.Vector3(0.6, 0.45, 0.66).normalize(), r: 0.5, depth: 0.16 },
    { dir: new THREE.Vector3(-0.35, -0.7, 0.62).normalize(), r: 0.3, depth: 0.09 },
  ];
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    let f = 1;
    let amp = 0.16;
    let freq = 1.8;
    for (let o = 0; o < 3; o++) {
      f += amp * (vnoise3(n.x * freq + 3.1, n.y * freq + 7.3, n.z * freq + 1.7) - 0.5) * 2;
      amp *= 0.5;
      freq *= 2.1;
    }
    for (const c of craters) {
      const t = (1 - n.dot(c.dir)) / c.r; // 0 at the centre, 1 at the rim
      if (t < 1) f -= c.depth * (1 - t * t) * (1 - t * t);
      f += c.depth * 0.25 * Math.exp(-Math.pow((t - 1) * 4, 2));
    }
    pos.setXYZ(i, n.x * 0.075 * f * 1.35, n.y * 0.075 * f, n.z * 0.075 * f);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#5f544b", roughness: 1, metalness: 0 }));
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
  private ship: Ship;
  private sunGlow: GlowSprite;
  private sky = new THREE.Group();
  private flare: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly sunNdc = new THREE.Vector3();
  private readonly toBody = new THREE.Vector3();
  private readonly camFwd = new THREE.Vector3();
  private readonly drift = new THREE.Vector3();
  private readonly bodies: { c: THREE.Vector3; r: number }[] = [
    { c: EARTH, r: 1 },
    { c: MOON, r: 0.4 },
    { c: MARS, r: MARS_R },
  ];
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
  private baseFov = 40; // set by the aspect logic; the dolly zoom narrows from it
  private burn = 0;
  private warm = false; // true once compileAsync has seen every material
  private introT = -1; // seconds into the "lights on" intro; -1 = not started
  private readonly shipForward = new THREE.Vector3(0, 0, -1).applyEuler(SHIP_ROT);
  private readonly heroQ = { landscape: new THREE.Quaternion(), portrait: new THREE.Quaternion() };
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpAim = new THREE.Vector3();
  // shot 2 framing (camera + look target) for each layout: the burn keeps this composition
  private readonly shot2 = {
    landscape: { pos: v(SHOTS[2].pos), look: v(SHOTS[2].look) },
    portrait: { pos: v(SHOTS[2].pPos), look: v(SHOTS[2].pLook) },
  };
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
    lattice = noiseLattice();
    const freeLattice = () => {
      lattice?.dispose();
      lattice = null;
    };
    const abort = () => {
      made.forEach((rt) => rt.dispose());
      freeLattice();
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
    freeLattice();

    /* ---- studio reflections for the cruiser (its own slice; not on the low tier) ---- */
    let env: THREE.WebGLRenderTarget | null = null;
    if (q.envMap) {
      env = await step(() => {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const rt = pmrem.fromScene(room, 0.04);
        room.dispose();
        pmrem.dispose();
        return rt;
      });
      if (!env) return abort();
    }

    await yieldToMain();
    if (!alive()) return abort();
    return new OrbitWorld({ earthSurface, earthData, marsMap, moonMap, skyMap }, env, q, reduced);
  }

  private constructor(
    maps: Record<"earthSurface" | "earthData" | "marsMap" | "moonMap" | "skyMap", THREE.WebGLRenderTarget>,
    env: THREE.WebGLRenderTarget | null,
    private q: QualitySettings,
    private reduced: boolean,
  ) {
    const { earthSurface, earthData, marsMap, moonMap, skyMap } = maps;
    this.renderTargets.push(earthSurface, earthData, marsMap, moonMap, skyMap);
    if (env) this.renderTargets.push(env);

    /* ---- Earth: tilted axis, spinning surface, clouds drift in the shader ---- */
    const earthTilt = new THREE.Group();
    earthTilt.rotation.z = -0.41; // north pole leans away from the hero camera: the lit cities sit in temperate latitudes
    earthTilt.position.copy(EARTH);
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: planetVertex,
      fragmentShader: earthFrag,
      uniforms: {
        uSurface: { value: earthSurface.texture },
        uData: { value: earthData.texture },
        uSun: { value: SUN_DIR },
        uCloud: { value: 0 },
        uLights: { value: reduced ? 1 : 0 },
        uTexel: { value: new THREE.Vector2(1 / q.bake, 2 / q.bake) },
        uBump: { value: q.bake * 0.004 },
      },
      defines: q.tier === "low" ? {} : { RELIEF: "" },
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), this.earthMat);
    this.earthSpin.add(earth);
    this.earthSpin.rotation.y = 2.2;
    earthTilt.add(this.earthSpin);
    this.root.add(earthTilt);
    const earthAtm = atmosphereShell(EARTH, 1, 1.06, new THREE.Color(0.22, 0.5, 1.0), new THREE.Color(1.0, 0.5, 0.25), 0.9);
    earthAtm.position.copy(EARTH);
    this.root.add(earthAtm);

    /* ---- Moon ---- */
    const rockyMat = (map: THREE.Texture, width: number, atm: THREE.Color, atmAmt: number, bump: number, earthshine = 0) =>
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
          uEarth: { value: EARTH },
          uEarthshine: { value: earthshine },
        },
      });
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 64, 32),
      rockyMat(moonMap.texture, 512, new THREE.Color(0, 0, 0), 0, 0.042, 0.035),
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
    const marsAtm = atmosphereShell(MARS, MARS_R, 1.05, new THREE.Color(0.95, 0.55, 0.38), new THREE.Color(0.55, 0.62, 0.9), 1.1);
    marsAtm.position.copy(MARS);
    this.root.add(marsAtm);
    this.phobos = buildPhobos();
    this.root.add(this.phobos);

    /* ---- the cruiser ---- */
    this.ship = buildShip(q, env ? env.texture : null);
    this.ship.group.position.copy(SHIP);
    this.ship.group.rotation.copy(SHIP_ROT);
    this.root.add(this.ship.group);
    // hero attitude: nose (-z) along the heading, a slight roll so the ring reads as an ellipse
    const look = new THREE.Object3D();
    for (const k of ["landscape", "portrait"] as const) {
      look.position.set(0, 0, 0);
      look.lookAt(HERO_HEADING[k].clone().negate()); // +z away from the heading → nose along it
      look.rotateZ(0.5);
      this.heroQ[k].copy(look.quaternion);
    }

    /* ---- lights for the lit materials (ship, Phobos) ---- */
    const sun = new THREE.DirectionalLight("#fff3e2", 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(50);
    this.root.add(sun);
    this.root.add(sun.target);
    // cool rim from behind: separates the hull edges from black space
    const rim = new THREE.DirectionalLight("#7fa6ff", 0.25);
    rim.position.copy(SUN_DIR).multiplyScalar(-50);
    this.root.add(rim);
    this.root.add(rim.target);
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

    const sunGlow = glowSprite(new THREE.Color(1.0, 0.9, 0.75), 120, 0.05, reduced ? 1.4 : 0.35);
    sunGlow.position.copy(SUN_DIR).multiplyScalar(600);
    sunGlow.renderOrder = -1;
    this.sky.add(sunGlow);
    this.sunGlow = sunGlow;
    this.root.add(this.sky);

    /* ---- lens flare: full-screen additive pass, only drawn while the sun is near the frame ---- */
    this.flare = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: flareVertex,
        fragmentShader: flareFrag,
        uniforms: {
          uSun: { value: new THREE.Vector2() },
          uAspect: { value: 1 },
          uVis: { value: 0 },
          uGlare: { value: 0 },
          uTint: { value: new THREE.Color(1.0, 0.86, 0.66) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.flare.frustumCulled = false;
    this.flare.renderOrder = 20;
    this.root.add(this.flare);

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
    this.disposables.push(...this.ship.extra);
  }

  /** After compileAsync: every program exists, so the plume can hide until the burn. */
  afterWarmup() {
    this.warm = true;
    this.applyShipVisibility();
  }

  /** The canvas is visible: switch the city lights and the sun on. */
  startIntro() {
    if (!this.reduced && this.introT < 0) this.introT = 0;
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
      this.baseFov = this.isPortrait ? 58 : aspect < 1.3 ? 48 : 40;
      camera.fov = this.baseFov;
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
    // slow hand-held drift (full motion only), strongest on the hero shot
    const drifting = !this.reduced;

    if (moved || drifting) {
      const rig = this.isPortrait ? this.portrait : this.landscape;
      const i = Math.min(SHOT_COUNT - 2, Math.floor(this.current));
      const f = this.current - i;
      // hold each chapter's composition for the first part of its leg, then glide to the next
      const g = Math.min(1, Math.max(0, (f - 0.14) / 0.86));
      const eased = g * g * g * (g * (g * 6 - 15) + 10);
      const t = (i + eased) / (SHOT_COUNT - 1);
      rig.pos.getPoint(t, this.tmpPos);
      rig.look.getPoint(t, this.tmpLook);
      this.flyShip(camera); // may adjust the camera during the burn
      if (drifting) {
        const k = 0.012 + 0.02 * (1 - smoothstep(0, 1, this.current));
        const t = this.time;
        this.drift.set(Math.sin(t * 0.21) * k, Math.sin(t * 0.17 + 1.3) * k * 0.6, Math.cos(t * 0.13) * k * 0.8);
        this.tmpPos.add(this.drift);
      }
      camera.position.copy(this.tmpPos);
      camera.lookAt(this.tmpLook);
    }
    this.updateFlare(camera, aspect);

    // flight streaks: trail length follows the camera's speed
    if (!this.reduced && !this.first && dt > 0) {
      this.velocity.subVectors(camera.position, this.prevPos).divideScalar(Math.max(dt, 1 / 240));
      this.trailTarget.copy(this.velocity).multiplyScalar(0.045);
      const len = this.trailTarget.length();
      if (len > 3.5) this.trailTarget.multiplyScalar(3.5 / len);
      this.trailTarget.multiplyScalar(1 + this.burn * 2); // streaks stretch during the burn
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
      this.ship.ring.rotation.z += dt * 0.4;
      this.starsMat.uniforms.uTime.value = this.time;
      this.placePhobos();
      // nose strobe: a short flash every 1.4 s
      this.ship.navLights.strobe.material.uniforms.uIntensity.value = this.time % 1.4 < 0.12 ? 2.2 : 0.12;
      // shock diamonds travel down the plume (high tier only)
      if (this.q.tier === "high" && this.ship.plume.visible) this.ship.plume.material.uniforms.uTime.value = this.time;
    }

    // intro: the night side switches on city by city, the sun brightens
    let intro = false;
    if (this.introT >= 0 && this.introT < INTRO_S) {
      this.introT = Math.min(INTRO_S, this.introT + dt);
      const k = 1 - Math.pow(1 - this.introT / INTRO_S, 3);
      this.earthMat.uniforms.uLights.value = k;
      this.sunGlow.material.uniforms.uIntensity.value = 1.4 * (0.25 + 0.75 * k);
      intro = this.introT < INTRO_S;
    }

    this.sky.position.copy(camera.position);

    if (moved || trailing || intro) return "continuous";
    return this.reduced ? "idle" : "ambient";
  }

  /** Sun position on screen and how much of it the planets hide (angular radius vs. angle to the sun). */
  private updateFlare(camera: THREE.PerspectiveCamera, aspect: number) {
    const u = this.flare.material.uniforms;
    camera.getWorldDirection(this.camFwd);
    const facing = this.camFwd.dot(SUN_DIR);
    if (facing < 0.5) {
      this.flare.visible = false;
      return;
    }
    this.sunNdc.copy(SUN_DIR).multiplyScalar(1000).add(camera.position).project(camera);
    let vis = smoothstep(0.5, 0.8, facing);
    let glare = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      this.toBody.subVectors(b.c, camera.position);
      const dist = this.toBody.length();
      const theta = Math.acos(Math.min(1, this.toBody.dot(SUN_DIR) / dist)); // angle sun ↔ body centre
      const alpha = Math.asin(Math.min(1, b.r / dist)); // angular radius
      const edge = theta - alpha; // > 0: sun is outside the disc
      const soft = 0.6 * DEG + alpha * 0.02;
      vis *= smoothstep(-soft, soft * 2.5, edge);
      glare = Math.max(glare, Math.exp(-Math.pow(edge / (3 * DEG), 2)));
    }
    this.flare.visible = vis > 0.002;
    u.uSun.value.set(this.sunNdc.x, this.sunNdc.y);
    u.uAspect.value = aspect;
    u.uVis.value = vis * this.sunGlow.material.uniforms.uIntensity.value / 1.4;
    u.uGlare.value = glare;
  }

  /**
   * Burn, departure and dolly zoom: all pure functions of the shot position.
   * Works on tmpPos / tmpLook (the camera rig) before they are applied.
   */
  private flyShip(camera: THREE.PerspectiveCamera) {
    const c = this.current;
    const burn = smoothstep(2.12, 2.55, c) * (1 - smoothstep(2.85, 3.0, c));
    const away = smoothstep(2.55, 3.0, c);
    this.burn = burn;
    const s2 = this.isPortrait ? this.shot2.portrait : this.shot2.landscape;

    const ship = this.ship;
    if (c < 1) {
      // parked in the hero frame, drifting very slowly along its orbit
      const k = this.isPortrait ? "portrait" : "landscape";
      ship.group.position.copy(HERO_SHIP[k]).addScaledVector(HERO_HEADING[k], Math.sin(this.time * 0.05) * 0.01);
      ship.group.quaternion.copy(this.heroQ[k]);
      ship.group.scale.setScalar(HERO_SCALE[k]);
      ship.burn.value = 0;
      ship.engineLight.material.uniforms.uIntensity.value = 0.45;
      ship.engineLight.material.uniforms.uSize.value = 0.32;
      ship.plume.material.uniforms.uBurn.value = 0;
      this.burn = 0;
      if (this.warm) this.applyShipVisibility();
      if (camera.fov !== this.baseFov) {
        camera.fov = this.baseFov;
        camera.updateProjectionMatrix();
      }
      return;
    }
    ship.group.scale.setScalar(1);
    ship.group.rotation.set(SHIP_ROT.x, SHIP_ROT.y, SHIP_ROT.z);
    const pos = ship.group.position.copy(SHIP);
    if (c > 2 && c < 3) {
      // ride along with the camera (the frame holds on the ship), then leave toward Mars
      pos.add(this.tmpPos).sub(s2.pos).addScaledVector(this.shipForward, away * away * away * DEPART);
      // keep the shot-2 composition aimed at the ship, easing back to the rig's look before shot 3
      this.tmpAim.copy(pos).add(s2.look).sub(SHIP);
      this.tmpLook.lerp(this.tmpAim, 1 - smoothstep(2.8, 3.0, c));
    }
    ship.group.rotation.z = SHIP_ROT.z + away * 0.25;
    ship.burn.value = burn;
    ship.engineLight.material.uniforms.uIntensity.value = 0.45 + burn * 2.2;
    ship.engineLight.material.uniforms.uSize.value = 0.32 + burn * 0.9;
    ship.plume.material.uniforms.uBurn.value = burn;
    // hidden only after the warm-up has compiled it (a reload deep in the page starts past shot 3)
    if (this.warm) this.applyShipVisibility();

    // dolly zoom: narrow the lens and back away so the ship keeps its size while space stretches
    let fov = this.baseFov;
    if (burn > 0) {
      fov = this.baseFov * (1 - 0.35 * burn);
      const d0 = s2.pos.distanceTo(SHIP); // the ride-along keeps the shot-2 distance
      const d = (d0 * Math.tan((this.baseFov / 2) * DEG)) / Math.tan((fov / 2) * DEG);
      this.tmpDir.subVectors(this.tmpLook, this.tmpPos).normalize();
      this.tmpPos.addScaledVector(this.tmpDir, -(d - d0));
    }
    if (Math.abs(camera.fov - fov) > 0.01 || (burn === 0 && camera.fov !== fov)) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Plume only while burning; the whole ship goes once it is a few pixels away. */
  private applyShipVisibility() {
    const c = this.current;
    this.ship.group.visible = c < 2.96;
    this.ship.plume.visible = this.q.plume && this.burn > 0.001;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.renderTargets.forEach((rt) => rt.dispose());
    this.disposables = [];
    this.renderTargets = [];
  }
}
