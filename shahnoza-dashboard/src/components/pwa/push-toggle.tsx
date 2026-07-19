"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

/** VAPID public key (base64url) → Uint8Array for PushManager.subscribe. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Enable/disable browser (PWA) push notifications for this device. No-ops with
 * a clear message when push isn't configured server-side or the browser lacks
 * support (e.g. iPhone before "Add to Home Screen").
 */
export function PushToggle() {
  const config = api.push.config.useQuery();
  const subscribe = api.push.subscribe.useMutation();
  const unsubscribe = api.push.unsubscribe.useMutation();
  const sendTest = api.push.test.useMutation({
    onSuccess: () => toast({ title: "Test yuborildi", variant: "success" }),
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, []);

  if (config.data && !config.data.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Push bildirishnomalar hozircha sozlanmagan (server kalitlari kerak).
      </p>
    );
  }

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        Bu brauzer push bildirishnomalarni qo&apos;llab-quvvatlamaydi. iPhone&apos;da
        avval ilovani <b>Share → Bosh ekranga qo&apos;shish</b> orqali o&apos;rnating,
        so&apos;ng shu yerdan yoqing.
      </p>
    );
  }

  async function enable() {
    const key = config.data?.publicKey;
    if (!key) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast({ title: "Ruxsat berilmadi", variant: "destructive" });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      await subscribe.mutateAsync({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      setEnabled(true);
      toast({ title: "Bildirishnomalar yoqildi", variant: "success" });
    } catch (e) {
      toast({
        title: "Xato",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribe.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast({ title: "Bildirishnomalar o'chirildi" });
    } catch {
      toast({ title: "Xato", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {enabled ? (
          <Button variant="outline" onClick={disable} disabled={busy}>
            <BellOff className="h-4 w-4" /> O&apos;chirish
          </Button>
        ) : (
          <Button onClick={enable} disabled={busy || permission === "denied"}>
            <Bell className="h-4 w-4" /> Bildirishnomalarni yoqish
          </Button>
        )}
        {enabled && (
          <Button
            variant="ghost"
            onClick={() => sendTest.mutate()}
            disabled={sendTest.isPending}
          >
            <Send className="h-4 w-4" /> Test yuborish
          </Button>
        )}
      </div>
      {permission === "denied" && (
        <p className="text-sm text-destructive">
          Bildirishnomalar brauzer sozlamalarida bloklangan. Yoqish uchun sayt
          ruxsatlaridan bildirishnomalarga <b>Allow</b> bering.
        </p>
      )}
    </div>
  );
}
