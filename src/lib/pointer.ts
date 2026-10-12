/*
  Custom cursor (a 10px dot + a 36px ring) and magnetic buttons. Desktop only,
  imported lazily by PointerFx. Transform/translate only; the rAF loop runs while
  the pointer or the ring is still moving and stops when everything has settled.
  One getBoundingClientRect per button, on pointerenter — no layout reads per frame.
*/

const MAGNET = 6; // max px a button leans toward the pointer
const HOVERABLE = "a, button";

export function startPointer(): () => void {
  const dot = document.createElement("div");
  const ring = document.createElement("div");
  const ringInner = document.createElement("span");
  dot.className = "cursor-dot";
  ring.className = "cursor-ring";
  ring.append(ringInner);
  for (const el of [dot, ring]) el.setAttribute("aria-hidden", "true");
  document.body.append(dot, ring);
  const root = document.documentElement;

  let x = -100;
  let y = -100;
  let rx = x;
  let ry = y;
  let raf = 0;
  let visible = false;

  // magnetic button currently under the pointer
  let btn: HTMLElement | null = null;
  let box = { cx: 0, cy: 0, hw: 1, hh: 1 };

  const frame = () => {
    raf = 0;
    rx += (x - rx) * 0.22;
    ry += (y - ry) * 0.22;
    if (Math.abs(x - rx) < 0.1 && Math.abs(y - ry) < 0.1) {
      rx = x;
      ry = y;
    }
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    if (btn) {
      const dx = Math.max(-1, Math.min(1, (x - box.cx) / box.hw)) * MAGNET;
      const dy = Math.max(-1, Math.min(1, (y - box.cy) / box.hh)) * MAGNET;
      btn.style.translate = `${dx.toFixed(2)}px ${dy.toFixed(2)}px`;
    }
    if (rx !== x || ry !== y) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    x = e.clientX;
    y = e.clientY;
    if (!visible) {
      visible = true;
      rx = x;
      ry = y;
      root.classList.add("has-cursor");
    }
    kick();
  };
  const onOver = (e: PointerEvent) => {
    const target = e.target as Element | null;
    ring.toggleAttribute("data-hover", !!target?.closest(HOVERABLE));
    const b = target?.closest<HTMLElement>(".btn") ?? null;
    if (b === btn) return;
    if (btn) btn.style.translate = "";
    btn = b;
    if (btn) {
      const r = btn.getBoundingClientRect();
      box = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 };
    }
  };
  const release = () => {
    if (btn) btn.style.translate = "";
    btn = null;
  };
  const onLeaveWindow = () => {
    visible = false;
    release();
    root.classList.remove("has-cursor");
  };
  const onDown = () => ring.setAttribute("data-down", "");
  const onUp = () => ring.removeAttribute("data-down");

  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerover", onOver, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeaveWindow);
  window.addEventListener("scroll", release, { passive: true }); // the measured box is stale after a scroll
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });

  return () => {
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerover", onOver);
    document.documentElement.removeEventListener("pointerleave", onLeaveWindow);
    window.removeEventListener("scroll", release);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    if (raf) cancelAnimationFrame(raf);
    release();
    root.classList.remove("has-cursor");
    dot.remove();
    ring.remove();
  };
}
