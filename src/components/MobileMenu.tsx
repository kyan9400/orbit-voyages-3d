"use client";

/*
  Section menu for screens narrower than the desktop nav (60rem). A solid panel
  slides in under the fixed header; it only animates when full motion is on.
  Escape or a link closes it, focus moves in on open and back to the button on
  close, Tab stays inside, and the page behind does not scroll while it is open.
  Everything outside the header is inert meanwhile, so screen-reader swipes stay
  in the menu too.
*/
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getReducedServerSnapshot, getReducedSnapshot, subscribeNoop } from "@/lib/motion";

type Link = { href: string; label: string };

function lockScroll(lock: boolean) {
  document.documentElement.style.overflow = lock ? "hidden" : "";
  const menu = document.getElementById("mobile-menu");
  for (const el of document.body.children) {
    if (el instanceof HTMLElement && !el.contains(menu) && el.tagName !== "SCRIPT") el.inert = lock;
  }
}

export default function MobileMenu({ links, cta }: { links: Link[]; cta: Link }) {
  const [open, setOpen] = useState(false);
  const reduced = useSyncExternalStore(subscribeNoop, getReducedSnapshot, getReducedServerSnapshot);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus = true) => {
    lockScroll(false);
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current || !buttonRef.current) return;
      // keep Tab inside: the menu button plus the panel's links
      const items = [buttonRef.current, ...panelRef.current.querySelectorAll<HTMLElement>("a")];
      const first = items[0];
      const last = items[items.length - 1];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (i === -1 || i === items.length - 1)) {
        e.preventDefault();
        first.focus();
      }
    };
    // the panel is hidden from 60rem up, so close it if the window grows past that
    const wide = window.matchMedia("(min-width: 60rem)");
    const onWide = () => {
      if (wide.matches) close(false);
    };

    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      lockScroll(false);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="menu-button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="menu-button__icon" data-open={open ? "" : undefined} aria-hidden="true">
          <span />
          <span />
        </span>
        {open ? "Close" : "Menu"}
      </button>
      <div
        ref={panelRef}
        id="mobile-menu"
        className="mobile-menu"
        data-motion={reduced ? undefined : "full"}
        hidden={!open}
      >
        <nav aria-label="Sections">
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => close()}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a className="btn mobile-menu__cta" href={cta.href} onClick={() => close()}>
          {cta.label}
        </a>
      </div>
    </>
  );
}
