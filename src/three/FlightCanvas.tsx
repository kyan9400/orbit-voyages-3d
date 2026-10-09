"use client";

/*
  The lazily loaded 3D chunk. Loaded with next/dynamic({ ssr: false }), after the
  page is interactive, so the HTML and its text render instantly.

  Frame loop: frameloop="demand". Scrolling invalidates; while the camera is still
  settling we render every display frame; when it rests, ambient effects (spin,
  clouds, ring) ask for ~30 fps; with reduced motion nothing renders until the next scroll.
*/
import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { detectQuality, type QualitySettings } from "@/lib/quality";
import { flight } from "@/lib/flight";
import { OrbitWorld } from "./world";

function setWebglState(state: "ready" | "failed") {
  document.documentElement.dataset.webgl = state;
}

function Engine({ q, reduced }: { q: QualitySettings; reduced: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);
  const worldRef = useRef<OrbitWorld | null>(null);
  const loop = useRef({ timer: 0, slowAvg: 16.7, streak: 0, dpr: 0, lastWasContinuous: false });

  useEffect(() => {
    let alive = true;
    const world = new OrbitWorld(gl, q, reduced);
    worldRef.current = world;
    scene.add(world.root);
    flight.invalidate = () => invalidate();

    // warm-up behind the curtain: compile every program before the canvas is shown
    const warm = async () => {
      world.update(camera as THREE.PerspectiveCamera, 0, gl.domElement.clientWidth, gl.domElement.clientHeight, gl.getPixelRatio());
      try {
        await gl.compileAsync(scene, camera);
      } catch {
        /* compile errors surface on first render instead */
      }
      if (!alive) return;
      invalidate();
      requestAnimationFrame(() => requestAnimationFrame(() => alive && setWebglState("ready")));
    };
    void warm();

    const onVisible = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    const state = loop.current;
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(state.timer);
      flight.invalidate = null;
      scene.remove(world.root);
      world.dispose();
      worldRef.current = null;
    };
  }, [gl, scene, camera, invalidate, q, reduced]);

  useFrame((state, delta) => {
    const world = worldRef.current;
    if (!world) return;
    const l = loop.current;
    const mode = world.update(
      state.camera as THREE.PerspectiveCamera,
      delta,
      state.size.width,
      state.size.height,
      state.viewport.dpr,
    );

    // adaptive resolution: judge only back-to-back frames (continuous mode)
    if (l.dpr === 0) l.dpr = state.viewport.dpr;
    if (l.lastWasContinuous && delta > 0.004 && delta < 0.1) {
      l.slowAvg += (delta * 1000 - l.slowAvg) * 0.1;
      l.streak++;
      const floor = Math.min(1, q.dprCap) * 0.75;
      if (l.streak > 40 && l.slowAvg > 24 && l.dpr > floor) {
        l.dpr = Math.max(floor, l.dpr * 0.8);
        setDpr(l.dpr);
        l.streak = 0;
        l.slowAvg = 16.7;
      }
    }
    l.lastWasContinuous = mode === "continuous";

    if (document.hidden) return;
    if (mode === "continuous") {
      state.invalidate();
    } else if (mode === "ambient" && !l.timer) {
      l.timer = window.setTimeout(() => {
        l.timer = 0;
        invalidate();
      }, 33);
    }
  });

  return null;
}

export default function FlightCanvas({ reduced }: { reduced: boolean }) {
  // decided once, before the Canvas exists
  const [q] = useState(() => detectQuality());

  useEffect(() => {
    if (!q) setWebglState("failed");
  }, [q]);

  if (!q) return null;
  const cap = Math.min(q.dprCap, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  return (
    <Canvas
      className="flight-canvas"
      frameloop="demand"
      dpr={[1, cap]}
      gl={{ antialias: q.antialias, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 40, near: 0.05, far: 2000, position: [0, 0, 4] }}
      onCreated={({ gl }) => {
        gl.setClearColor("#04050a", 1);
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setWebglState("failed");
        });
      }}
    >
      <Engine q={q} reduced={reduced} />
    </Canvas>
  );
}
