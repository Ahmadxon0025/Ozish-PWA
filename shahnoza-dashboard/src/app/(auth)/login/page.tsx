"use client";

import { useState } from "react";
import { Stethoscope, LogIn, Loader2, CheckCircle2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

type Status = "idle" | "loading" | "sent" | "error";

/** Detect if input is email or phone. */
function detectInputType(value: string): "email" | "phone" | "unknown" {
  const trimmed = value.trim();
  // Phone: digits only, typically 9-15 chars (international format)
  if (/^\d{7,15}$/.test(trimmed)) return "phone";
  // Email: contains @
  if (/@/.test(trimmed)) return "email";
  return "unknown";
}

/** Friendlier Uzbek messages for the common Supabase auth errors. */
function friendly(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Email yoki parol noto'g'ri.";
  if (/email rate limit/i.test(msg)) return "Juda ko'p urinish — birozdan so'ng qayta urinib ko'ring.";
  return msg;
}

export default function LoginPage() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [credential, setCredential] = useState(""); // email or phone
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const configured = isSupabaseConfigured();
  const inputType = detectInputType(credential);

  async function loginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!credential || !password) return;
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();

      if (inputType === "phone") {
        // Look up email by phone number via API
        const res = await fetch("/api/auth/phone-to-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: credential.trim() }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Telefon raqami topilmadi.");
        }
        const { email } = await res.json();

        // Now sign in with the resolved email
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // Direct email sign-in
        const { error } = await supabase.auth.signInWithPassword({
          email: credential.trim(),
          password,
        });
        if (error) throw error;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setStatus("error");
      setMessage(friendly(err instanceof Error ? err.message : "Xatolik yuz berdi."));
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!credential) return;
    if (inputType !== "email") {
      setStatus("error");
      setMessage("Kirish havolasi faqat email uchun ishlaydi.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: credential.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(friendly(err instanceof Error ? err.message : "Xatolik yuz berdi."));
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">{APP_NAME}</CardTitle>
          <CardDescription>
            Shahnoza Reabilitolog — ichki boshqaruv paneli
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!configured && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
              Supabase hali sozlanmagan. <code>.env.local</code> faylini to&apos;ldiring.
            </div>
          )}

          {status === "sent" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <div>
                <p className="font-medium">Havola yuborildi!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <b>{credential}</b> pochtangizga kirish havolasini yubordik.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setStatus("idle")} className="mt-2">
                Ortga
              </Button>
            </div>
          ) : mode === "password" ? (
            <form onSubmit={loginWithPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="credential">Email yoki telefon raqam</Label>
                <Input
                  id="credential"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="siz@example.com yoki 901234567"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  required
                  disabled={!configured || status === "loading"}
                />
                {credential && inputType === "unknown" && (
                  <p className="text-xs text-muted-foreground">
                    Email (@) yoki raqam kiriting (7-15 raqam)
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Parol</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={!configured || status === "loading"}
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{message}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!configured || status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Kirilyapti…
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" /> Kirish
                  </>
                )}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:underline"
                onClick={() => {
                  setMode("magic");
                  setStatus("idle");
                  setMessage("");
                }}
              >
                Parolni bilmayapsizmi? Email orqali kirish
              </button>
            </form>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="memail">Email manzil</Label>
                <Input
                  id="memail"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="siz@example.com"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  required
                  disabled={!configured || status === "loading"}
                />
              </div>
              {status === "error" && (
                <p className="text-sm text-destructive">{message}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                variant="secondary"
                disabled={!configured || status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Yuborilmoqda…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" /> Kirish havolasini yuborish
                  </>
                )}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:underline"
                onClick={() => {
                  setMode("password");
                  setStatus("idle");
                  setMessage("");
                }}
              >
                Parol bilan kirish
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
