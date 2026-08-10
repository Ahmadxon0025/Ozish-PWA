"use client";

import { useEffect, useRef, useState } from "react";

const KEY = "sidebar-collapsed";
const EVT = "sidebar:toggle";

/**
 * Tiny cross-component store for the desktop sidebar's collapsed state.
 * The Sidebar and the Topbar's toggle button live in different subtrees, so we
 * sync them through a window event + localStorage instead of prop-drilling
 * through the server layout. Persists per browser.
 */
export function useSidebarCollapsed(): [boolean, (v?: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef(false);

  useEffect(() => {
    let init = false;
    try { init = localStorage.getItem(KEY) === "1"; } catch { /* ignore */ }
    ref.current = init;
    setCollapsed(init);
    const onEvt = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      ref.current = next;
      setCollapsed(next);
    };
    window.addEventListener(EVT, onEvt as EventListener);
    return () => window.removeEventListener(EVT, onEvt as EventListener);
  }, []);

  const toggle = (v?: boolean) => {
    const next = typeof v === "boolean" ? v : !ref.current;
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
  };

  return [collapsed, toggle];
}
