"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AlfredPanel } from "./alfred-panel";

const POS_KEY = "alfred-fab-pos";

/** Floating Alfred launcher — draggable (position persists), click to open. */
export function AlfredButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setPos(JSON.parse(raw) as { x: number; y: number });
    } catch {
      /* ignore */
    }
  }, []);

  // /brain hosts Alfred full-page — a second launcher there collides with the
  // embedded composer.
  if (pathname === "/brain") return null;

  function onDown(e: ReactPointerEvent) {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
  }
  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) d.moved = true;
    if (!d.moved) return;
    const x = Math.max(8, Math.min(window.innerWidth - 64, d.ox + dx));
    const y = Math.max(8, Math.min(window.innerHeight - 64, d.oy + dy));
    setPos({ x, y });
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setOpen(true);
    } else {
      setPos((p) => {
        if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
        return p;
      });
    }
  }

  return (
    <>
      {/* Floating button — hidden while the panel is open so it never overlaps
          the send arrow or follow-up chips */}
      {!open && (
        <button
          ref={btnRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
          className="fixed z-40 flex h-14 w-14 touch-none cursor-grab items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg transition-shadow hover:shadow-xl active:cursor-grabbing"
          style={pos ? { left: pos.x, top: pos.y } : { right: 24, bottom: 96 }}
          title="Alfred — sudrab ko'chiring, bosib oching"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Alfred Panel */}
      {open && <AlfredPanel onClose={() => setOpen(false)} />}
    </>
  );
}
