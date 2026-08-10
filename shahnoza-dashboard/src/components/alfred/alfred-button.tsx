"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AlfredPanel } from "./alfred-panel";

export function AlfredButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // /brain hosts Alfred full-page — a second floating entry point there
  // just collides with the embedded panel's composer. The funnel-bot canvas
  // is an immersive builder — its own zoom/add controls live bottom-right, so
  // hide the global FABs there too.
  if (pathname === "/brain" || pathname === "/marketing/funnel-bot/flow") return null;

  return (
    <>
      {/* Floating button — hidden while the panel is open so it never
          overlaps the send arrow or follow-up chips */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow"
          title="Alfred - Smart Task Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Alfred Panel */}
      {open && <AlfredPanel onClose={() => setOpen(false)} />}
    </>
  );
}
