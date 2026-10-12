/*
  The Meridian-class cruiser, built entirely in code.

  Axis: nose (panorama dome) at -z, engine at +z, overall length ≈ 1.65.
  The habitat ring (radius 0.42) sits at z = -0.2 and spins around the axis.

  - Hull: one smooth lathe from a Catmull-Rom profile (welded seam, smooth normals).
  - Materials: clearcoat paint, brushed anisotropic ring, iridescent gold foil,
    procedural solar cells, a glossy dome lit from inside. Low tier: standard materials.
  - Every detail part sits on the surface with real clearance (no z-fighting).
*/
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { QualitySettings } from "@/lib/quality";
import { glowSprite, type GlowSprite } from "./glow";
import { plumeFrag, plumeVertex, windowGlowFrag, windowGlowVertex } from "./shaders";

export type Ship = {
  group: THREE.Group;
  ring: THREE.Group;
  plume: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  engineLight: GlowSprite;
  navLights: { port: GlowSprite; starboard: GlowSprite; strobe: GlowSprite };
  /** 0 idle → 1 full burn: drives the nozzle's hot inner face */
  burn: { value: number };
  /** owned textures and instanced meshes (disposed by the world) */
  extra: { dispose: () => void }[];
};

/* Hull profile as [radius, z], nose to tail: dome collar → neck → spine → service bay → engine mount. */
const PROFILE: [number, number][] = [
  [0.128, -0.7],
  [0.136, -0.63],
  [0.132, -0.52],
  [0.105, -0.43],
  [0.066, -0.36],
  [0.058, -0.29],
  [0.055, -0.1],
  [0.057, 0.1],
  [0.08, 0.19],
  [0.09, 0.29],
  [0.088, 0.45],
  [0.07, 0.54],
  [0.045, 0.6],
  [0.03, 0.635],
];

/* Turns RoomEnvironment so its brightest side panels face the sun (SUN_DIR is mostly +x). */
const ENV_YAW = Math.PI + 0.337;

function sampleProfile(): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    PROFILE.map(([r, z]) => new THREE.Vector3(r, z, 0)),
    false,
    "centripetal",
  );
  return curve.getPoints(63).map((p) => new THREE.Vector2(p.x, p.y));
}

/** Hull radius at a given z, read from the sampled profile (matches the lathe exactly). */
function radiusAt(pts: THREE.Vector2[], z: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (z >= a.y && z <= b.y) return a.x + ((b.x - a.x) * (z - a.y)) / Math.max(1e-6, b.y - a.y);
  }
  return pts[pts.length - 1].x;
}

/** Lathe around y, turned so the profile's "y" runs along +z; seam welded for smooth normals. */
function lathe(pts: THREE.Vector2[], segments: number, keepUv = false): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.LatheGeometry(pts, segments);
  geo.rotateX(Math.PI / 2);
  if (keepUv) return geo; // the bell needs its uv (shader gradient); its seam is invisible inside the dark metal
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  return geo;
}

/* Solar wing cells: 16 × 4 cells with bus bars and a frame, as colour + roughness maps. */
function solarTextures(): [THREE.DataTexture, THREE.DataTexture] {
  const W = 256;
  const H = 64;
  const col = new Uint8Array(W * H * 4);
  const rough = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const frame = x < 2 || x >= W - 2 || y < 2 || y >= H - 2;
      const bus = x % 16 === 0 || y % 16 === 0;
      const cell = (Math.floor(x / 16) * 7 + Math.floor(y / 16) * 13) % 5; // slight per-cell tint
      let r = 12 + cell * 2;
      let g = 24 + cell * 3;
      let b = 66 + cell * 5;
      let ro = 56; // ≈ 0.22: glossy cells
      if (frame) {
        r = 150; g = 154; b = 162; ro = 120;
      } else if (bus) {
        r = 112; g = 120; b = 134; ro = 140;
      }
      col.set([r, g, b, 255], i);
      rough.set([ro, ro, ro, 255], i);
    }
  }
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, W, H);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  return [make(col, true), make(rough, false)];
}

export function buildShip(q: QualitySettings, env: THREE.Texture | null): Ship {
  const group = new THREE.Group();
  const phys = q.shipDetail > 0;
  const high = q.shipDetail === 2;
  const radial = q.shipDetail === 0 ? 32 : 48;
  const extra: { dispose: () => void }[] = [];

  /* ---------------- materials ---------------- */
  const withEnv = <T extends THREE.MeshStandardMaterial>(m: T): T => {
    if (env) {
      m.envMap = env;
      m.envMapIntensity = 0.6;
      m.envMapRotation.set(0, ENV_YAW, 0);
    }
    return m;
  };
  const hull = withEnv(
    phys
      ? new THREE.MeshPhysicalMaterial({ color: "#d9dce2", roughness: 0.38, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 })
      : new THREE.MeshStandardMaterial({ color: "#d4d7dd", roughness: 0.45, metalness: 0.08 }),
  );
  const brushed = withEnv(
    phys
      ? new THREE.MeshPhysicalMaterial({
          color: "#c9cdd5",
          metalness: 1,
          roughness: 0.32,
          ...(high ? { anisotropy: 0.7, anisotropyRotation: 0 } : {}),
        })
      : new THREE.MeshStandardMaterial({ color: "#b9bdc6", metalness: 0.45, roughness: 0.4 }),
  );
  const gold = withEnv(
    phys
      ? new THREE.MeshPhysicalMaterial({
          color: "#c79a4a",
          metalness: 1,
          roughness: 0.28,
          ...(high ? { iridescence: 0.6, iridescenceIOR: 1.6 } : {}),
        })
      : new THREE.MeshStandardMaterial({ color: "#c79a4a", metalness: 0.5, roughness: 0.35 }),
  );
  const [cellMap, cellRough] = solarTextures();
  extra.push(cellMap, cellRough);
  const solar = withEnv(
    phys
      ? new THREE.MeshPhysicalMaterial({
          color: "#ffffff",
          map: cellMap,
          roughnessMap: cellRough,
          roughness: 1,
          metalness: 0.6,
          ...(high ? { iridescence: 0.3 } : {}),
        })
      : new THREE.MeshStandardMaterial({ color: "#ffffff", map: cellMap, roughnessMap: cellRough, roughness: 1, metalness: 0.3 }),
  );
  // panorama dome: near-black glass with a warm lounge glow (no transmission pass)
  const glass = withEnv(
    phys
      ? new THREE.MeshPhysicalMaterial({
          color: "#06070b",
          roughness: 0.05,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          emissive: "#3a2410",
        })
      : new THREE.MeshStandardMaterial({ color: "#08090d", roughness: 0.15, metalness: 0.2, emissive: "#3a2410" }),
  );
  const dark = withEnv(new THREE.MeshStandardMaterial({ color: "#2c313b", metalness: phys ? 0.7 : 0.35, roughness: 0.42 }));
  const seam = new THREE.MeshStandardMaterial({ color: "#3a3f4b", metalness: 0.3, roughness: 0.6 });

  // engine bell: dark metal outside, inner face glows from the throat and follows the burn
  const burn = { value: 0 };
  const bellMat = withEnv(
    new THREE.MeshStandardMaterial({ color: "#30343c", metalness: phys ? 0.8 : 0.4, roughness: 0.35, side: THREE.DoubleSide }),
  );
  bellMat.onBeforeCompile = (shader) => {
    shader.uniforms.uBurn = burn;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBellV;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvBellV = uv.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uBurn;\nvarying float vBellV;")
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
        vec3 hot = mix(vec3(1.0, 0.42, 0.14), vec3(0.75, 0.85, 1.0), uBurn);
        float throat = pow(1.0 - vBellV, 1.6);
        totalEmissiveRadiance += gl_FrontFacing
          ? hot * smoothstep(0.93, 1.0, vBellV) * uBurn * 1.5
          : hot * throat * (0.12 + uBurn * 3.0);`,
      );
  };
  bellMat.customProgramCacheKey = () => "orbit-bell";

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rz = 0, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    parent.add(m);
    return m;
  };
  const alongZ = <T extends THREE.BufferGeometry>(g: T) => g.rotateX(Math.PI / 2);

  /* ---------------- hull ---------------- */
  const profile = sampleProfile();
  add(lathe(profile, radial), hull);

  // panorama dome, its lip and the hexagonal shield plate behind it
  const domeGeo = new THREE.SphereGeometry(0.125, radial, Math.round(radial / 2), 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.rotateX(-Math.PI / 2).scale(1, 1, 0.9);
  add(domeGeo, glass, 0, 0, -0.7);
  add(new THREE.TorusGeometry(0.126, 0.008, 10, radial), dark, 0, 0, -0.7);
  add(alongZ(new THREE.CylinderGeometry(0.17, 0.17, 0.022, 6)), dark, 0, 0, -0.66, Math.PI / 6);

  // panel lines: thin rings seated just proud of the lathe surface
  for (const z of [-0.6, -0.48, -0.32, 0.0, 0.24, 0.5]) {
    add(new THREE.TorusGeometry(radiusAt(profile, z) + 0.0012, 0.0015, q.shipDetail === 0 ? 4 : 6, radial + 16), seam, 0, 0, z);
  }

  /* ---------------- tanks (gold foil) on struts ---------------- */
  for (const side of [-1, 1]) {
    add(alongZ(new THREE.CapsuleGeometry(0.055, 0.24, 8, 24)), gold, side * 0.145, 0, 0.03);
    for (const z of [-0.04, 0.1]) {
      const strut = add(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 10), dark, side * 0.072, 0, z);
      strut.rotation.z = Math.PI / 2;
    }
  }

  /* ---------------- solar wings + spar ---------------- */
  const spar = add(new THREE.CylinderGeometry(0.0045, 0.0045, 1.6, 8), dark, 0, 0, 0.36);
  spar.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.62, 0.006, 0.24), solar, 0.48, 0, 0.36);
  add(new THREE.BoxGeometry(0.62, 0.006, 0.24), solar, -0.48, 0, 0.36);

  /* ---------------- radiator fins on the service bay (45° off the wings) ---------------- */
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const fin = new RoundedBoxGeometry(0.008, 0.13, 0.17, 2, 0.003);
    add(fin, hull, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.38, a - Math.PI / 2);
  }

  /* ---------------- docking collar on the belly ---------------- */
  add(new THREE.CylinderGeometry(0.032, 0.036, 0.05, 24), dark, 0, -0.072, -0.02);
  const dockRing = add(new THREE.TorusGeometry(0.03, 0.004, 8, 32), brushed, 0, -0.097, -0.02);
  dockRing.rotation.x = Math.PI / 2;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    add(new THREE.BoxGeometry(0.012, 0.01, 0.012), seam, Math.cos(a) * 0.04, -0.092, -0.02 + Math.sin(a) * 0.04);
  }

  /* ---------------- engine bell ---------------- */
  const bellPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    bellPts.push(new THREE.Vector2(0.035 + (0.12 - 0.035) * Math.pow(t, 0.7), 0.6 + t * 0.22));
  }
  add(lathe(bellPts, radial, true), bellMat);
  add(new THREE.CircleGeometry(0.032, 24), dark, 0, 0, 0.635); // closes the hull's tail inside the bell

  /* ---------------- habitat ring ---------------- */
  const ring = new THREE.Group();
  ring.position.z = -0.2;
  add(new THREE.TorusGeometry(0.42, 0.045, 16, 96), brushed, 0, 0, 0, 0, ring);
  add(alongZ(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 32)), hull, 0, 0, 0, 0, ring); // hub
  // spokes: two rings of three, offset 60°
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    add(
      new THREE.CylinderGeometry(0.012, 0.012, 0.3, q.shipDetail === 0 ? 8 : 16),
      brushed,
      Math.cos(a) * 0.235,
      Math.sin(a) * 0.235,
      k % 2 ? 0.018 : -0.018,
      a - Math.PI / 2,
      ring,
    );
  }
  // windows: 72 lit boxes on the outer equator, 1 mm clear of the tube
  const COUNT = 72;
  const dummy = new THREE.Object3D();
  dummy.up.set(0, 0, 1);
  const placeOnRing = (mesh: THREE.InstancedMesh, r: number) => {
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      dummy.lookAt(Math.cos(a) * r * 2, Math.sin(a) * r * 2, 0); // +z faces outward
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    extra.push(mesh);
    ring.add(mesh);
  };
  placeOnRing(
    new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.018, 0.008, 0.004),
      new THREE.MeshBasicMaterial({ color: "#ffd9a0", toneMapped: false }),
      COUNT,
    ),
    0.468,
  );
  if (high) {
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: windowGlowVertex,
      fragmentShader: windowGlowFrag,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.72, 0.42) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    placeOnRing(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.026), glowMat, COUNT), 0.473);
  }
  group.add(ring);

  /* ---------------- lights: engine, nav lights, strobe ---------------- */
  const engineLight = glowSprite(new THREE.Color(0.45, 0.65, 1.0), 0.55, 0.08, 0.9);
  engineLight.position.set(0, 0, 0.9);
  group.add(engineLight);
  const port = glowSprite(new THREE.Color(1.0, 0.18, 0.12), 0.1, 0.2, 1.4);
  port.position.set(-0.8, 0, 0.36);
  const starboard = glowSprite(new THREE.Color(0.2, 1.0, 0.45), 0.1, 0.2, 1.4);
  starboard.position.set(0.8, 0, 0.36);
  const strobe = glowSprite(new THREE.Color(1, 1, 1), 0.12, 0.2, 1.0);
  strobe.position.set(0, 0, -0.84);
  group.add(port, starboard, strobe);

  /* ---------------- exhaust plume (hidden until the burn) ---------------- */
  const plumeGeo = new THREE.CylinderGeometry(0.12, 0.5, 2.4, q.shipDetail === 0 ? 16 : 32, 1, true);
  plumeGeo.rotateX(-Math.PI / 2).translate(0, 0, 0.82 + 1.2); // narrow end at the nozzle exit
  const plume = new THREE.Mesh(
    plumeGeo,
    new THREE.ShaderMaterial({
      vertexShader: plumeVertex,
      fragmentShader: plumeFrag,
      uniforms: {
        uBurn: { value: 0 },
        uTime: { value: 0 },
        uBands: { value: q.tier === "low" ? 0 : 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  plume.frustumCulled = false;
  group.add(plume); // stays visible until the shader warm-up has compiled it

  return { group, ring, plume, engineLight, navLights: { port, starboard, strobe }, burn, extra };
}
