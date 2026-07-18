"use client";

import { useState } from "react";
import { Stethoscope, Mail, Loader2, CheckCircle2 } from "lucide-react";
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Xatolik yuz berdi.");
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
              Supabase hali sozlanmagan. <code>.env.local</code> faylini
              to'ldiring.
            </div>
          )}

          {status === "sent" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <div>
                <p className="font-medium">Havola yuborildi!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <b>{email}</b> pochtangizga kirish havolasini yubordik.
                  Havolani bosing va tizimga kiring.
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setStatus("idle")}
                className="mt-2"
              >
                Boshqa email bilan urinish
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email manzil</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="siz@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Yuborilmoqda…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" /> Kirish havolasini yuborish
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Parol kerak emas — emailga sehrli havola yuboramiz.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
