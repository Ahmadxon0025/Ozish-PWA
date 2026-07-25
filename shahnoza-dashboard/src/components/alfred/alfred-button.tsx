"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { AlfredPanel } from "./alfred-panel";

export function AlfredButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow"
        title="Alfred - Smart Task Assistant"
      >
        <Sparkles className="h-6 w-6" />
      </button>

      {/* Alfred Panel */}
      {open && <AlfredPanel onClose={() => setOpen(false)} />}
    </>
  );
}
