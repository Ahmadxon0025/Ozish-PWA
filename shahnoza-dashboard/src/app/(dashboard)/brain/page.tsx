"use client";

import { useRef, useState, useEffect } from "react";
import { Sparkles, Send, Loader2, User } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/empty-state";
import { toast } from "@/hooks/use-toast";

type Msg = { role: "user" | "ai"; text: string };

const SUGGESTIONS = [
  "Bu oy qancha sotuv bo'ldi?",
  "Kim eng ko'p sotuv qildi?",
  "Nechta lead bor va konversiya qancha?",
  "Kimda muddati o'tgan vazifalar bor?",
  "Bu oy sof foyda qancha?",
];

export default function BrainPage() {
  const aiOn = api.ai.status.useQuery();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = api.ai.ask.useMutation({
    onSuccess: (res) => setMessages((m) => [...m, { role: "ai", text: res.text }]),
    onError: (e) => {
      setMessages((m) => [...m, { role: "ai", text: `⚠️ ${e.message}` }]);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  function send(q: string) {
    const text = q.trim();
    if (!text || ask.isPending) return;
    // Send recent turns as context so the AI can follow up.
    const history = messages.slice(-8).map((m) => ({
      role: (m.role === "ai" ? "assistant" : "user") as "assistant" | "user",
      content: m.text,
    }));
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    ask.mutate({ question: text, history });
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="AI Miya"
        description="Biznes haqida savol bering — sotuv, lead, vazifa, moliya. AI jonli ma'lumotdan javob beradi."
      />

      {aiOn.data && !aiOn.data.configured ? (
        <EmptyState
          icon={Sparkles}
          title="AI sozlanmagan"
          description="ANTHROPIC_API_KEY kiritilgach ishga tushadi."
        />
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Nimani bilmoqchisiz? Quyidagilardan birini tanlang yoki o&apos;zingiz yozing.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border px-3 py-1.5 text-sm hover:bg-accent"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {m.role === "ai" && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {m.text}
                    </div>
                    {m.role === "user" && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {ask.isPending && (
                <div className="flex gap-2">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> O&apos;ylayapti…
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t pt-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Savol yozing…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") send(input);
                }}
                disabled={ask.isPending}
              />
              <Button onClick={() => send(input)} disabled={!input.trim() || ask.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
