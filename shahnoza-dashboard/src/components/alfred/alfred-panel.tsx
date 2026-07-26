"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  ThumbsUp,
  ThumbsDown,
  Search,
  MapPin,
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

/** While Alfred works, cycle a reasoning trace instead of a frozen label. */
const THINKING_STEPS = [
  "So'rovingizni o'qiyapman…",
  "Ma'lumotlar bazasini tekshiryapman…",
  "Raqamlarni solishtiryapman…",
  "Javobni tayyorlayapman…",
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
    emoji: "🗓",
    label: "Muddat",
    prompts: [
      "Bugun qanday muddatlar bor?",
      "Shu haftadagi barcha muddatlarni ko'rsat",
      "Shu vazifaning muddatini surish kerak: ",
      "Kelasi hafta rejasini tuzib ber",
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
  memoryCandidates?: Array<{ content: string; category: string }>;
  executed?: Array<{
    logId: string | null;
    success: boolean;
    message: string;
  }>;
};

/* ------------------------------------------------------------------ */
/* Lightweight Markdown renderer: bold, bullets, headers, internal    */
/* links. No external dependency; covers what the model emits.        */
/* ------------------------------------------------------------------ */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: **bold** before *italic*; links; then _italic_.
  const regex =
    /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^)\s]+)\)|\*([^*\n]+?)\*|_([^_\n]+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}b${i++}`} className="font-semibold text-white">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      // Guard: a link whose path has no id (e.g. "/tasks/" or "/leads/")
      // renders as plain bold text — never a dead link.
      const href = m[3];
      const deadLink = /^\/[a-z-]+\/?$/i.test(href) || href.endsWith("/");
      if (deadLink) {
        nodes.push(
          <strong
            key={`${keyPrefix}b${i++}`}
            className="font-semibold text-white"
          >
            {m[2]}
          </strong>
        );
      } else {
        nodes.push(
          <a
            key={`${keyPrefix}l${i++}`}
            href={href}
            className="text-purple-300 underline underline-offset-2 hover:text-purple-200"
          >
            {m[2]}
          </a>
        );
      }
    } else {
      // *italic* or _italic_
      nodes.push(
        <em key={`${keyPrefix}i${i++}`} className="italic text-slate-300">
          {m[4] ?? m[5]}
        </em>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** A markdown table separator row like |---|:--:|---| — never shown. */
function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

/** A pipe table row (leading pipe, or ≥2 pipes anywhere — covers both styles). */
function isTableRow(line: string): boolean {
  const t = line.trim();
  if (isTableSeparator(line)) return false;
  return t.startsWith("|") || (line.match(/\|/g)?.length ?? 0) >= 2;
}

function tableCells(line: string): string[] {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter((c, idx, arr) => !(c === "" && (idx === 0 || idx === arr.length - 1)));
}

/** Render a contiguous run of pipe rows as a real, horizontally-scrollable table. */
function MarkdownTable({ rows, keyId }: { rows: string[]; keyId: string }) {
  // First non-separator row is the header; separator rows are dropped.
  const dataRows = rows.filter((r) => !isTableSeparator(r)).map(tableCells);
  if (dataRows.length === 0) return null;
  const [head, ...body] = dataRows;
  return (
    <div className="my-1 overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {head.map((c, j) => (
              <th
                key={j}
                className="border-b border-slate-700 px-2 py-1 text-left font-semibold text-white"
              >
                {renderInline(c, `${keyId}h${j}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className="border-b border-slate-800 px-2 py-1 text-slate-300"
                >
                  {renderInline(c, `${keyId}r${ri}c${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Group a contiguous run of table rows into one real <table>.
    if (isTableRow(line) || isTableSeparator(line)) {
      const rows: string[] = [];
      while (
        i < lines.length &&
        (isTableRow(lines[i]) || isTableSeparator(lines[i]))
      ) {
        rows.push(lines[i]);
        i++;
      }
      i--; // step back; the for-loop will advance
      blocks.push(<MarkdownTable key={`tbl${i}`} rows={rows} keyId={`tbl${i}`} />);
      continue;
    }

    const header = line.match(/^#{1,4}\s+(.*)/);
    if (header) {
      blocks.push(
        <p key={i} className="pt-1 font-semibold text-white">
          {renderInline(header[1], `h${i}`)}
        </p>
      );
      continue;
    }
    const bullet = line.match(/^\s*[-•*]\s+(.*)/);
    if (bullet) {
      blocks.push(
        <p key={i} className="pl-3">
          •&nbsp;{renderInline(bullet[1], `u${i}`)}
        </p>
      );
      continue;
    }
    if (line.trim() === "") {
      blocks.push(<div key={i} className="h-1.5" />);
      continue;
    }
    blocks.push(<p key={i}>{renderInline(line, `p${i}`)}</p>);
  }

  return <div className="space-y-1">{blocks}</div>;
}

/* ------------------------------------------------------------------ */

export function AlfredPanel({
  onClose,
  variant = "overlay",
}: {
  onClose?: () => void;
  variant?: "overlay" | "page";
}) {
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoneMessages, setUndoneMessages] = useState<Record<string, boolean>>(
    {}
  );
  const [memoryResolved, setMemoryResolved] = useState<Record<string, boolean>>(
    {}
  );
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showRetryMenu, setShowRetryMenu] = useState(false);
  const [openPill, setOpenPill] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [headlineIdx, setHeadlineIdx] = useState(0);

  const alfredChat = api.alfred.chat.useMutation();
  const extractMemoryMutation = api.alfred.extractMemory.useMutation();
  const undoMutation = api.alfred.undoAction.useMutation();
  const newConversationMutation = api.alfred.newConversation.useMutation();
  const deleteMemoryMutation = api.alfred.deleteMemory.useMutation();
  const saveMemoriesMutation = api.alfred.saveMemories.useMutation();
  const rateAnswerMutation = api.alfred.rateAnswer.useMutation();
  const utils = api.useUtils();

  const me = api.users.me.useQuery(undefined, { staleTime: Infinity });
  const savedConversation = api.alfred.getConversation.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const suggestionsQuery = api.alfred.getSuggestions.useQuery(
    { page: pathname ?? undefined },
    { staleTime: 60_000, refetchOnWindowFocus: false }
  );
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
  const popoverOpenRef = useRef(false);
  popoverOpenRef.current = !!(openPill || showHistory || showRetryMenu);

  const pageLabel = suggestionsQuery.data?.pageLabel ?? null;

  // Personalized headline — only when the stored name looks like a real name,
  // never the raw login handle (digits = handle, e.g. an email prefix)
  const rawFirst = me.data?.full_name?.trim().split(/\s+/)[0];
  const firstName = rawFirst && !/\d/.test(rawFirst) ? rawFirst : null;
  const headlines = useMemo(
    () => [
      "Jamoangizning aqlli yordamchisi",
      firstName ? `${firstName}ning AI yordamchisi` : "Sizning AI yordamchingiz",
      "Nimadan boshlaymiz?",
      "Alfred — sizning qo'lingizda",
    ],
    [firstName]
  );

  useEffect(() => {
    const t = setInterval(() => setHeadlineIdx((i) => i + 1), 3500);
    return () => clearInterval(t);
  }, []);

  // Rotating thinking trace while waiting
  useEffect(() => {
    if (!isLoading) {
      setThinkingStep(0);
      return;
    }
    const t = setInterval(
      () => setThinkingStep((s) => Math.min(s + 1, THINKING_STEPS.length - 1)),
      4000
    );
    return () => clearInterval(t);
  }, [isLoading]);

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

  const closeAllPopovers = () => {
    setOpenPill(null);
    setShowHistory(false);
    setShowRetryMenu(false);
  };

  const handleNewChat = () => {
    hydratedRef.current = true; // never re-hydrate the archived conversation
    setMessages([]);
    setConversationId(null);
    setShowMemories(false);
    closeAllPopovers();
    newConversationMutation.mutate();
    inputRef.current?.focus();
  };

  const openConversation = async (id: string) => {
    closeAllPopovers();
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
    closeAllPopovers();
    setMessage(prompt);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  // Escape: close any open popover first; only then close the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (popoverOpenRef.current) {
        setOpenPill(null);
        setShowHistory(false);
        setShowRetryMenu(false);
        return;
      }
      if (variant === "overlay" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, variant]);

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
    closeAllPopovers();

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
        page: pathname ?? undefined,
        conversationHistory,
      });

      if (response.success) {
        if (response.conversationId) {
          setConversationId(response.conversationId);
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

        // Memory extraction runs AFTER the answer is shown (off the response
        // latency path). If it finds new durable facts, attach them to this
        // message so the "Buni eslab qolaymi?" consent card appears.
        extractMemoryMutation
          .mutateAsync({
            userMessage: userMsg,
            assistantMessage: response.response,
          })
          .then((res) => {
            if (res.candidates && res.candidates.length > 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.messageId === messageId
                    ? { ...m, memoryCandidates: res.candidates }
                    : m
                )
              );
            }
          })
          .catch(() => {
            /* memory is best-effort */
          });
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

  /** Three retry modes: as-is, simpler, deeper. All replace the last exchange. */
  const handleRetry = (mode: "again" | "simpler" | "deeper") => {
    if (isLoading) return;
    setShowRetryMenu(false);
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx === -1) return;
    let content = messages[lastUserIdx].content;
    if (mode === "simpler") {
      content += " — soddaroq va qisqaroq tushuntirib ber";
    } else if (mode === "deeper") {
      content += " — ma'lumotlar bazasini chuqurroq tekshirib, batafsil javob ber";
    }
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

  const handleRate = (messageId: string, helpful: boolean) => {
    setRatings((prev) => ({ ...prev, [messageId]: helpful ? "up" : "down" }));
    rateAnswerMutation.mutate({ helpful });
  };

  const handleSaveMemories = async (msg: ChatMessage) => {
    if (!msg.messageId || !msg.memoryCandidates) return;
    try {
      const res = await saveMemoriesMutation.mutateAsync({
        memories: msg.memoryCandidates as any,
      });
      setMemoryResolved((prev) => ({ ...prev, [msg.messageId!]: true }));
      toast({
        title: "🧠 Xotiraga saqlandi",
        description: `${res.saved} ta ma'lumot eslab qolindi`,
        variant: "success",
      });
    } catch {
      toast({ title: "Saqlab bo'lmadi", variant: "destructive" });
    }
  };

  const handleDismissMemories = (messageId: string) => {
    setMemoryResolved((prev) => ({ ...prev, [messageId]: true }));
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

  // History grouping: Bugun / Kecha / date
  const groupedConversations = useMemo(() => {
    const list = (conversationsQuery.data?.conversations ?? []).filter(
      (c: any) =>
        !historySearch.trim() ||
        c.title.toLowerCase().includes(historySearch.trim().toLowerCase())
    );
    const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() + 5 * 3600 * 1000 - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const groups: Array<{ label: string; items: any[] }> = [];
    for (const c of list) {
      const day = new Date(c.updatedAt).toISOString().slice(0, 10);
      const label =
        day === today ? "Bugun" : day === yesterday ? "Kecha" : day;
      const g = groups.find((x) => x.label === label);
      if (g) g.items.push(c);
      else groups.push({ label, items: [c] });
    }
    return groups;
  }, [conversationsQuery.data, historySearch]);

  const isEmpty = messages.length === 0;
  const lastIndex = messages.length - 1;

  return (
    <>
      {/* Backdrop (overlay mode only) — above page FABs */}
      {variant === "overlay" && (
        <div
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}

      {/* Overlay: half-screen slide-over. Page: fills its container. */}
      <div
        className={
          variant === "overlay"
            ? "fixed right-0 top-0 z-[60] flex h-full w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl duration-300 animate-in slide-in-from-right sm:w-[85vw] md:w-[55vw] lg:w-1/2"
            : "relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="font-semibold text-white">Alfred</h2>
            <span className="text-xs text-slate-400">Smart Assistant</span>
          </div>
          <div className="relative z-[75] flex items-center gap-1">
            <button
              onClick={() => {
                setShowHistory((v) => {
                  if (!v) {
                    setOpenPill(null);
                    setShowRetryMenu(false);
                    setShowMemories(false);
                  }
                  return !v;
                });
              }}
              title="Suhbatlar tarixi"
              className={`relative z-[20] rounded-lg p-2 transition-colors hover:bg-slate-800 hover:text-white ${
                showHistory ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              <History className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                closeAllPopovers();
                setShowMemories((v) => !v);
              }}
              title="Alfred xotirasi"
              className={`relative z-[20] rounded-lg p-2 transition-colors hover:bg-slate-800 hover:text-white ${
                showMemories ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              <Brain className="h-4 w-4" />
            </button>
            <button
              onClick={handleNewChat}
              title="Yangi suhbat"
              className="relative z-[20] flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Yangi suhbat</span>
            </button>
            {variant === "overlay" && (
              <button
                onClick={onClose}
                className="relative z-[20] rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            {/* History dropdown */}
            {showHistory && (
              <>
                <div
                  className="fixed inset-0 z-[10]"
                  onClick={() => setShowHistory(false)}
                />
                <div className="absolute right-0 top-full z-[30] mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl">
                  <div className="mb-1 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Suhbatlarni qidirish…"
                      className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none"
                    />
                  </div>
                  {conversationsQuery.isLoading && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                    </div>
                  )}
                  {groupedConversations.length === 0 &&
                    !conversationsQuery.isLoading && (
                      <p className="px-2 py-3 text-xs text-slate-500">
                        Suhbat topilmadi
                      </p>
                    )}
                  {groupedConversations.map((g) => (
                    <div key={g.label}>
                      <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {g.label}
                      </p>
                      {g.items.map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => openConversation(c.id)}
                          className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-800"
                        >
                          <span className="block truncate text-sm text-slate-200">
                            {c.title}
                            {c.active && (
                              <span className="ml-1.5 text-[10px] text-purple-400">
                                • joriy
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        {showMemories ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
            <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-2 bg-slate-950 px-4 py-3 sm:-mx-6 sm:px-6">
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
              Alfred siz tasdiqlagan bilimlarni shu yerda saqlaydi. Noto'g'ri
              yoki eskirganini o'chirib tashlang — keyingi javoblarda
              ishlatilmaydi.
            </p>
            {memoriesQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              </div>
            )}
            {memoriesQuery.data?.memories.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                Xotira hozircha bo'sh — Alfred taklif qilganda "Eslab qol"
                tugmasini bossangiz, shu yerda paydo bo'ladi.
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
                    ? suggestionsQuery.data.suggestions.map(
                        (label: string, i: number) => ({
                          icon: SUGGESTIONS[i % SUGGESTIONS.length].icon,
                          label,
                        })
                      )
                    : SUGGESTIONS
                  ).map(({ icon: Icon, label }: any) => (
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
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "whitespace-pre-wrap bg-purple-600 text-white"
                            : "bg-slate-800/80 text-slate-200"
                        }`}
                      >
                        {msg.role === "alfred" ? (
                          <MarkdownText text={msg.content} />
                        ) : (
                          msg.content
                        )}
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
                              msg.executed.some(
                                (e) => e.success && e.logId
                              ) && (
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

                    {/* Memory consent card — nothing is stored until "Eslab qol" */}
                    {msg.memoryCandidates &&
                      msg.messageId &&
                      !memoryResolved[msg.messageId] && (
                        <div className="ml-10 mt-2">
                          <Card className="border-slate-700 bg-slate-900 p-3 text-xs space-y-2">
                            <p className="font-medium text-slate-300">
                              🧠 Buni eslab qolaymi?
                            </p>
                            {msg.memoryCandidates.map((c, j) => (
                              <p key={j} className="text-slate-400">
                                • [{c.category}] {c.content}
                              </p>
                            ))}
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                className="h-7 bg-purple-600 text-xs hover:bg-purple-700"
                                onClick={() => handleSaveMemories(msg)}
                                disabled={saveMemoriesMutation.isPending}
                              >
                                Eslab qol
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() =>
                                  handleDismissMemories(msg.messageId!)
                                }
                              >
                                Yo'q
                              </Button>
                            </div>
                          </Card>
                        </div>
                      )}

                    {/* Copy / rate / retry action bar on Alfred messages */}
                    {msg.role === "alfred" && !isLoading && msg.messageId && (
                      <div className="relative ml-10 mt-1 flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(msg.content)}
                          title="Nusxalash"
                          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRate(msg.messageId!, true)}
                          title="Foydali"
                          className={`rounded p-1 transition-colors hover:bg-slate-800 ${
                            ratings[msg.messageId] === "up"
                              ? "text-green-400"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRate(msg.messageId!, false)}
                          title="Foydasiz"
                          className={`rounded p-1 transition-colors hover:bg-slate-800 ${
                            ratings[msg.messageId] === "down"
                              ? "text-red-400"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                        {i === lastIndex && (
                          <>
                            <button
                              onClick={() => setShowRetryMenu((v) => !v)}
                              title="Qayta urinish"
                              className={`rounded p-1 transition-colors hover:bg-slate-800 ${
                                showRetryMenu
                                  ? "bg-slate-800 text-slate-300"
                                  : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            {showRetryMenu && (
                              <>
                                <div
                                  className="fixed inset-0 z-[65]"
                                  onClick={() => setShowRetryMenu(false)}
                                />
                                <div className="absolute bottom-full left-0 z-[70] mb-1 w-64 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl">
                                  <button
                                    onClick={() => handleRetry("again")}
                                    className="block w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                                  >
                                    🔄 Xuddi shu savol bilan qayta
                                  </button>
                                  <button
                                    onClick={() => handleRetry("simpler")}
                                    className="block w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                                  >
                                    ✂️ Soddaroq tushuntirsin
                                  </button>
                                  <button
                                    onClick={() => handleRetry("deeper")}
                                    className="block w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                                  >
                                    🔎 Chuqurroq tekshirsin
                                  </button>
                                </div>
                              </>
                            )}
                          </>
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
                      <span
                        key={thinkingStep}
                        className="text-sm duration-300 animate-in fade-in"
                      >
                        {THINKING_STEPS[thinkingStep]}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Intent pills (empty state only) — wraps, never clips */}
        {!showMemories && isEmpty && (
          <div className="px-4 pb-1 sm:px-6">
            {openPill &&
              (() => {
                const pill = INTENT_PILLS.find((p) => p.label === openPill);
                if (!pill) return null;
                return (
                  <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl duration-200 animate-in fade-in slide-in-from-bottom-2">
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
                );
              })()}
            <div className="flex flex-wrap gap-2 pb-1">
              {INTENT_PILLS.map((pill) => (
                <button
                  key={pill.label}
                  onClick={() => {
                    setShowHistory(false);
                    setShowRetryMenu(false);
                    setOpenPill(openPill === pill.label ? null : pill.label);
                  }}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    openPill === pill.label
                      ? "border-purple-500/60 bg-slate-800 text-white"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-purple-500/50 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span>{pill.emoji}</span>
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        {!showMemories && (
          <div className="px-4 pb-5 pt-2 sm:px-6">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 py-1.5 pl-4 pr-1.5 shadow-lg transition-colors focus-within:border-purple-500/60">
              <Sparkles className="h-5 w-5 shrink-0 text-purple-400" />
              {pageLabel && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] text-purple-300">
                  <MapPin className="h-3 w-3" />
                  {pageLabel}
                </span>
              )}
              <input
                ref={inputRef}
                type="text"
                placeholder="Alfred'dan so'rang..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isLoading && handleSend()
                }
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder-slate-500 outline-none"
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
