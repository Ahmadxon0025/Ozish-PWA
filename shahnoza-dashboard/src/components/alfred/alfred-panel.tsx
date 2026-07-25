"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Loader2,
  ArrowUp,
  Users,
  ClipboardList,
  TrendingUp,
  Plus,
  History,
  Brain,
  Copy,
  RefreshCw,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const SUGGESTIONS = [
  { icon: Users, label: "Jamoa yuklamasi qanday?" },
  { icon: ClipboardList, label: "Qaysi vazifalar kechikmoqda?" },
  { icon: TrendingUp, label: "Bu hafta nimaga e'tibor qaratish kerak?" },
];

/**
 * Intent pills: each opens a menu of half-written prompts that inject into
 * the composer (cursor at the end) — the user finishes the sentence.
 */
const INTENT_PILLS: Array<{ emoji: string; label: string; prompts: string[] }> = [
  {
    emoji: "🔍",
    label: "Topish",
    prompts: [
      "Muddati o'tgan vazifalarni top",
      "Bloklangan yoki uzoq turgan ishlarni ko'rsat",
      "Shu haqdagi vazifalarni qidir: ",
      "Shu odamning vazifalarini ko'rsat: ",
    ],
  },
  {
    emoji: "✍️",
    label: "Yaratish",
    prompts: [
      "Vazifa yarat: ",
      "Shu mavzuda reja tuz: ",
      "Yig'ilish kun tartibini yozib ber: ",
      "Shu odamga vazifa qo'y: ",
    ],
  },
  {
    emoji: "✏️",
    label: "O'zgartirish",
    prompts: [
      "Shu vazifaning statusini o'zgartir: ",
      "Shu vazifani boshqa odamga biriktir: ",
      "Shu vazifaning muddatini o'zgartir: ",
      "Shu vazifaning muhimligini oshir: ",
    ],
  },
  {
    emoji: "📊",
    label: "Tahlil",
    prompts: [
      "Bu hafta jamoa nima qildi?",
      "Kim eng ko'p yuklangan?",
      "Yaratilgan va bajarilgan vazifalarni solishtir",
      "Bu oy moliyaviy holat qanday?",
    ],
  },
  {
    emoji: "🎯",
    label: "Ustuvorlik",
    prompts: [
      "Hozir nimaga e'tibor qaratay?",
      "Bugungi eng muhim 3 ta ish nima?",
      "Qaysi ishlar kechikish xavfida?",
      "Yangi vazifalarni saralashga yordam ber",
    ],
  },
  {
    emoji: "💰",
    label: "Moliya",
    prompts: [
      "Hisoblarda qancha pul bor?",
      "Kimlardan to'lov undirishimiz kerak?",
      "Bu oy xarajatlar qancha bo'ldi?",
      "Sof foyda va marja qanday?",
    ],
  },
];

type ChatMessage = {
  role: "user" | "alfred";
  content: string;
  messageId?: string;
  followUps?: string[];
  executed?: Array<{
    logId: string | null;
    success: boolean;
    message: string;
  }>;
};

export function AlfredPanel({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoneMessages, setUndoneMessages] = useState<Record<string, boolean>>(
    {}
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [openPill, setOpenPill] = useState<string | null>(null);
  const [headlineIdx, setHeadlineIdx] = useState(0);

  const alfredChat = api.alfred.chat.useMutation();
  const undoMutation = api.alfred.undoAction.useMutation();
  const newConversationMutation = api.alfred.newConversation.useMutation();
  const deleteMemoryMutation = api.alfred.deleteMemory.useMutation();
  const utils = api.useUtils();

  const me = api.users.me.useQuery(undefined, { staleTime: Infinity });
  const savedConversation = api.alfred.getConversation.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const suggestionsQuery = api.alfred.getSuggestions.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const conversationsQuery = api.alfred.listConversations.useQuery(undefined, {
    enabled: showHistory,
    refetchOnWindowFocus: false,
  });
  const memoriesQuery = api.alfred.listMemories.useQuery(undefined, {
    enabled: showMemories,
    refetchOnWindowFocus: false,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);

  const firstName = me.data?.full_name?.trim().split(/\s+/)[0];
  const headlines = useMemo(
    () => [
      "Jamoangizning aqlli yordamchisi",
      ...(firstName ? [`${firstName}ning AI yordamchisi`] : []),
      "Nimadan boshlaymiz?",
      "Alfred — sizning qo'lingizda",
    ],
    [firstName]
  );

  useEffect(() => {
    const t = setInterval(() => setHeadlineIdx((i) => i + 1), 3500);
    return () => clearInterval(t);
  }, []);

  // Restore the saved conversation once, when the panel opens
  useEffect(() => {
    if (hydratedRef.current) return;
    const conv = savedConversation.data?.conversation;
    if (!conv || conv.messages.length === 0) return;
    hydratedRef.current = true;
    setConversationId(conv.id);
    setMessages(
      conv.messages.map((m) => ({
        role: m.role === "assistant" ? ("alfred" as const) : ("user" as const),
        content: m.content,
      }))
    );
  }, [savedConversation.data]);

  const handleNewChat = () => {
    hydratedRef.current = true; // never re-hydrate the archived conversation
    setMessages([]);
    setConversationId(null);
    setShowMemories(false);
    setShowHistory(false);
    newConversationMutation.mutate();
    inputRef.current?.focus();
  };

  const openConversation = async (id: string) => {
    setShowHistory(false);
    try {
      const res = await utils.alfred.getConversation.fetch({
        conversationId: id,
      });
      const conv = res.conversation;
      if (!conv) return;
      hydratedRef.current = true;
      setConversationId(conv.id);
      setMessages(
        conv.messages.map((m) => ({
          role:
            m.role === "assistant" ? ("alfred" as const) : ("user" as const),
          content: m.content,
        }))
      );
    } catch (error) {
      console.error("Failed to open conversation:", error);
    }
  };

  const injectPrompt = (prompt: string) => {
    setOpenPill(null);
    setMessage(prompt);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  const runSend = async (userMsg: string, base: ChatMessage[]) => {
    const withUser: ChatMessage[] = [
      ...base,
      { role: "user", content: userMsg },
    ];
    setMessages(withUser);
    setIsLoading(true);

    try {
      const conversationHistory = base.map((m) => ({
        role: (m.role === "alfred" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: m.content,
      }));

      const response = await alfredChat.mutateAsync({
        message: userMsg,
        conversationId: conversationId ?? undefined,
        conversationHistory,
      });

      if (response.success) {
        if (response.conversationId) {
          setConversationId(response.conversationId);
        }
        if (response.learned && response.learned > 0) {
          toast({
            title: "🧠 Alfred esladi",
            description: `${response.learned} ta yangi ma'lumot xotiraga saqlandi`,
          });
        }
        const executed =
          response.executed && response.executed.length > 0
            ? response.executed
            : undefined;
        if (executed) {
          const ok = executed.filter((e) => e.success).length;
          toast({
            title:
              ok === executed.length ? "Alfred bajardi" : "Qisman bajarildi",
            description: `${ok}/${executed.length} ta amal muvaffaqiyatli`,
            variant: ok > 0 ? "success" : "destructive",
          });
        }
        const messageId = `msg_${Date.now()}_${Math.random()}`;
        setMessages([
          ...withUser,
          {
            role: "alfred",
            content: response.response,
            messageId,
            executed,
            followUps: response.followUps ?? undefined,
          },
        ]);
      } else {
        setMessages([
          ...withUser,
          {
            role: "alfred",
            content: response.error || "Kechirasiz, xatolik yuz berdi.",
          },
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages([
        ...withUser,
        {
          role: "alfred",
          content: "Kechirasiz, xatolik yuz berdi. Qayta urinib ko'ring.",
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSend = async (text?: string) => {
    const userMsg = (text ?? message).trim();
    if (!userMsg || isLoading) return;
    setMessage("");
    await runSend(userMsg, messages);
  };

  const handleRetry = () => {
    if (isLoading) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx === -1) return;
    const content = messages[lastUserIdx].content;
    runSend(content, messages.slice(0, lastUserIdx));
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: "Nusxalandi", variant: "success" });
    } catch {
      // clipboard unavailable
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    try {
      await deleteMemoryMutation.mutateAsync({ memoryId });
      memoriesQuery.refetch();
      toast({ title: "Xotiradan o'chirildi", variant: "success" });
    } catch {
      toast({ title: "O'chirib bo'lmadi", variant: "destructive" });
    }
  };

  const handleUndo = async (msg: ChatMessage) => {
    if (!msg.messageId || !msg.executed) return;
    setUndoingId(msg.messageId);
    try {
      let undone = 0;
      for (const e of msg.executed) {
        if (e.success && e.logId) {
          const result = await undoMutation.mutateAsync({
            actionLogId: e.logId,
          });
          if (result.success) undone++;
        }
      }
      setUndoneMessages((prev) => ({ ...prev, [msg.messageId!]: true }));
      toast({
        title: "↩️ Bekor qilindi",
        description: `${undone} ta amal orqaga qaytarildi`,
        variant: "success",
      });
    } catch (error) {
      console.error("Undo error:", error);
      toast({
        title: "Bekor qilib bo'lmadi",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUndoingId(null);
    }
  };

  const isEmpty = messages.length === 0;
  const lastIndex = messages.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Half-screen slide-over panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl duration-300 animate-in slide-in-from-right sm:w-[85vw] md:w-[55vw] lg:w-1/2">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="font-semibold text-white">Alfred</h2>
            <span className="text-xs text-slate-400">Smart Assistant</span>
          </div>
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => {
                setShowHistory((v) => !v);
                setShowMemories(false);
              }}
              title="Suhbatlar tarixi"
              className={`rounded-lg p-2 transition-colors hover:bg-slate-800 hover:text-white ${
                showHistory ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              <History className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setShowMemories((v) => !v);
                setShowHistory(false);
              }}
              title="Alfred xotirasi"
              className={`rounded-lg p-2 transition-colors hover:bg-slate-800 hover:text-white ${
                showMemories ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              <Brain className="h-4 w-4" />
            </button>
            <button
              onClick={handleNewChat}
              title="Yangi suhbat"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Yangi suhbat</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            {/* History dropdown */}
            {showHistory && (
              <div className="absolute right-0 top-full z-10 mt-2 max-h-96 w-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
                <p className="px-2 pb-2 pt-1 text-xs font-medium text-slate-400">
                  Suhbatlar tarixi
                </p>
                {conversationsQuery.isLoading && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                  </div>
                )}
                {conversationsQuery.data?.conversations.length === 0 && (
                  <p className="px-2 py-3 text-xs text-slate-500">
                    Hali suhbatlar yo'q
                  </p>
                )}
                {conversationsQuery.data?.conversations.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className="block w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800"
                  >
                    <span className="block truncate text-sm text-slate-200">
                      {c.title}
                      {c.active && (
                        <span className="ml-1.5 text-[10px] text-purple-400">
                          • joriy
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        {showMemories ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setShowMemories(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h3 className="text-sm font-semibold text-white">
                🧠 Alfred xotirasi
              </h3>
            </div>
            <p className="mb-4 text-xs text-slate-400">
              Alfred suhbatlardan o'zi o'rgangan bilimlar. Noto'g'ri
              o'rganilganini o'chirib tashlang — keyingi javoblarda ishlatilmaydi.
            </p>
            {memoriesQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              </div>
            )}
            {memoriesQuery.data?.memories.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                Xotira hozircha bo'sh — Alfred bilan suhbatlashganingizda o'zi
                o'rganib boradi.
              </p>
            )}
            <div className="space-y-2">
              {memoriesQuery.data?.memories.map((m: any) => (
                <Card
                  key={m.id}
                  className="flex items-start gap-3 border-slate-700 bg-slate-900 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 inline-block rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-purple-300">
                      {m.category}
                    </span>
                    <p className="text-sm text-slate-200">{m.content}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    title="O'chirish"
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-950/40 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {isEmpty ? (
              <div className="flex h-full flex-col items-center justify-center px-6">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/20">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <h1
                  key={headlineIdx % headlines.length}
                  className="mb-2 text-center text-2xl font-bold text-white duration-500 animate-in fade-in"
                >
                  {headlines[headlineIdx % headlines.length]}
                </h1>
                <p className="mb-8 max-w-sm text-center text-sm text-slate-400">
                  Alfred vazifalar, jamoa yuklamasi va moliya bo'yicha
                  savollarga javob beradi — va aytganingizni bajaradi.
                </p>
                <div className="flex w-full max-w-sm flex-col gap-2">
                  {(suggestionsQuery.data?.suggestions?.length
                    ? suggestionsQuery.data.suggestions.map((label, i) => ({
                        icon: SUGGESTIONS[i % SUGGESTIONS.length].icon,
                        label,
                      }))
                    : SUGGESTIONS
                  ).map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      onClick={() => handleSend(label)}
                      className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left text-sm text-slate-300 transition-colors hover:border-purple-500/50 hover:bg-slate-800 hover:text-white"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-purple-400" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-4 py-5 sm:px-6">
                {messages.map((msg, i) => (
                  <div key={i}>
                    <div
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "alfred" && (
                        <div className="mr-2.5 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
                          <Sparkles className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-purple-600 text-white"
                            : "bg-slate-800/80 text-slate-200"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>

                    {/* Action results + undo */}
                    {msg.executed &&
                      msg.executed.length > 0 &&
                      msg.messageId && (
                        <div className="ml-10 mt-2">
                          <Card className="border-purple-600/50 bg-purple-950/20 p-3 text-xs space-y-2">
                            {msg.executed.map((e, j) => (
                              <p
                                key={j}
                                className={
                                  e.success ? "text-slate-300" : "text-red-400"
                                }
                              >
                                {e.success ? "✅" : "❌"} {e.message}
                              </p>
                            ))}
                            {undoneMessages[msg.messageId] ? (
                              <p className="text-slate-400">↩️ Bekor qilindi</p>
                            ) : (
                              msg.executed.some((e) => e.success && e.logId) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => handleUndo(msg)}
                                  disabled={undoingId === msg.messageId}
                                >
                                  {undoingId === msg.messageId ? (
                                    <>
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      Bekor qilinmoqda...
                                    </>
                                  ) : (
                                    "↩️ Bekor qilish"
                                  )}
                                </Button>
                              )
                            )}
                          </Card>
                        </div>
                      )}

                    {/* Copy / retry action bar on Alfred messages */}
                    {msg.role === "alfred" && !isLoading && (
                      <div className="ml-10 mt-1 flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(msg.content)}
                          title="Nusxalash"
                          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {i === lastIndex && (
                          <button
                            onClick={handleRetry}
                            title="Qayta urinish"
                            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Follow-up chips under the latest answer */}
                    {msg.role === "alfred" &&
                      i === lastIndex &&
                      !isLoading &&
                      msg.followUps &&
                      msg.followUps.length > 0 && (
                        <div className="ml-10 mt-2 flex flex-wrap gap-2">
                          {msg.followUps.map((f) => (
                            <button
                              key={f}
                              onClick={() => handleSend(f)}
                              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-purple-500/50 hover:bg-slate-800 hover:text-white"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="mr-2.5 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl bg-slate-800/80 px-4 py-2.5 text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Alfred o'ylayapti...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Intent pills (empty state only) */}
        {!showMemories && isEmpty && (
          <div className="px-4 pb-1 sm:px-6">
            {openPill && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpenPill(null)}
              />
            )}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {INTENT_PILLS.map((pill) => (
                <div key={pill.label} className="relative shrink-0">
                  {openPill === pill.label && (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl">
                      {pill.prompts.map((p) => (
                        <button
                          key={p}
                          onClick={() => injectPrompt(p)}
                          className="block w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                        >
                          {p.endsWith(": ") ? `${p}…` : p}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setOpenPill(openPill === pill.label ? null : pill.label)
                    }
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      openPill === pill.label
                        ? "border-purple-500/60 bg-slate-800 text-white"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-purple-500/50 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span>{pill.emoji}</span>
                    {pill.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        {!showMemories && (
          <div className="px-4 pb-5 pt-2 sm:px-6">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 py-1.5 pl-4 pr-1.5 shadow-lg transition-colors focus-within:border-purple-500/60">
              <Sparkles className="h-5 w-5 shrink-0 text-purple-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Alfred'dan so'rang..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isLoading && handleSend()
                }
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-50"
                disabled={isLoading}
                autoFocus
              />
              <button
                onClick={() => handleSend()}
                disabled={!message.trim() || isLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:opacity-40"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
