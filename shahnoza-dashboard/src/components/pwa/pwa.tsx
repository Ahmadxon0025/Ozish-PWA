"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Registers the service worker and surfaces an install affordance:
 *  a one-tap button on Android/desktop, a one-time hint on iOS. */
export function Pwa() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS has no beforeinstallprompt — nudge once via the Share sheet.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos && !standalone && !localStorage.getItem("pwa-ios-hint")) {
      setIosHint(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (deferred) {
    return (
      <button
        onClick={install}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg md:bottom-4"
      >
        <Download className="h-4 w-4" /> Ilovani o&apos;rnatish
      </button>
    );
  }

  if (iosHint) {
    return (
      <div className="fixed inset-x-4 bottom-20 z-50 flex items-start gap-2 rounded-xl border bg-background p-3 text-sm shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:max-w-xs">
        <p className="flex-1">
          Telefonga o&apos;rnatish: pastdagi <b>Share</b> tugmasi →{" "}
          <b>Add to Home Screen</b>.
        </p>
        <button
          aria-label="Yopish"
          onClick={() => {
            localStorage.setItem("pwa-ios-hint", "1");
            setIosHint(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
