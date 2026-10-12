/* Additive camera-facing glow (sun, engine, nav lights): bloom without post-processing. */
import * as THREE from "three";
import { billboardVertex, glowFrag } from "./shaders";

export type GlowSprite = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export function glowSprite(color: THREE.Color, size: number, core: number, intensity: number): GlowSprite {
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
