"use client";

import { AlfredPanel } from "@/components/alfred/alfred-panel";
import { PageHeader } from "@/components/layout/page-header";

/**
 * Full-page Alfred (formerly "AI Miya"). Same brain as the slide-over panel:
 * one assistant, one memory, one conversation history — two entry points.
 */
export default function BrainPage() {
  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[480px] flex-col">
      <PageHeader
        title="Alfred"
        description="Jamoangizning aqlli yordamchisi — savol bering, vazifa buyuring, moliyani so'rang."
      />
      <div className="min-h-0 flex-1">
        <AlfredPanel variant="page" />
      </div>
    </div>
  );
}
