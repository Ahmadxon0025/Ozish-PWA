"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Loader2,
  ArrowUp,
  Users,
  ClipboardList,
  TrendingUp,
  Plus,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const SUGGESTIONS = [
  {
    icon: Users,
    label: "Jamoa yuklamasi qanday?",
  },
  {
    icon: ClipboardList,
    label: "Qaysi vazifalar kechikmoqda?",
  },
  {
    icon: TrendingUp,
    label: "Bu hafta nimaga e'tibor qaratish kerak?",
  },
];

export function AlfredPanel({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      role: "user" | "alfred";
      content: string;
      proposal?: any;
      messageId?: string;
    }>
  >([]);

  const [isLoading, setIsLoading] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [resolvedProposals, setResolvedProposals] = useState<
    Record<string, "executed" | "dismissed">
  >({});
  const alfredChat = api.alfred.chat.useMutation();
  const executeActionMutation = api.alfred.executeAction.useMutation();
  const newConversationMutation = api.alfred.newConversation.useMutation();
  const savedConversation = api.alfred.getConversation.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const suggestionsQuery = api.alfred.getSuggestions.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);

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
    newConversationMutation.mutate();
    inputRef.current?.focus();
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

  const handleSend = async (text?: string) => {
    const userMsg = (text ?? message).trim();
    if (!userMsg || isLoading) return;

    setMessage("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const conversationHistory = messages.map((m) => ({
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
        const messageId = `msg_${Date.now()}_${Math.random()}`;
        setMessages((prev) => [
          ...prev,
          {
            role: "alfred",
            content: response.response,
            proposal: response.proposal,
            messageId,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "alfred",
            content: response.error || "Sorry, I encountered an error.",
          },
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "alfred",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleExecuteAction = async (proposal: any, messageId: string) => {
    if (!conversationId || !proposal?.actions) return;

    setExecutingAction(messageId);

    try {
      const results: Array<{ success: boolean; text: string }> = [];
      for (const action of proposal.actions) {
        const result: any = await executeActionMutation.mutateAsync({
          conversationId,
          actionId: action.id || `action_${Date.now()}`,
          actionType: action.type,
          data: action.data || {},
        });
        results.push({
          success: !!result.success,
          text: result.message || result.error || "Bajarildi",
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "alfred",
          content: results
            .map((r) => `${r.success ? "✅" : "❌"} ${r.text}`)
            .join("\n"),
        },
      ]);
      setResolvedProposals((prev) => ({ ...prev, [messageId]: "executed" }));

      const okCount = results.filter((r) => r.success).length;
      toast({
        title:
          okCount === results.length ? "Amallar bajarildi" : "Qisman bajarildi",
        description: `${okCount}/${results.length} ta amal muvaffaqiyatli`,
        variant: okCount > 0 ? "success" : "destructive",
      });
    } catch (error) {
      console.error("Action execution error:", error);
      toast({
        title: "Bajarib bo'lmadi",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  const handleDismissProposal = (messageId: string) => {
    setResolvedProposals((prev) => ({ ...prev, [messageId]: "dismissed" }));
  };

  const isEmpty = messages.length === 0;

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
          <div className="flex items-center gap-1">
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
          </div>
        </div>

        {/* Messages / hero */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/20">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h1 className="mb-2 text-center text-2xl font-bold text-white">
                Jamoangizning aqlli yordamchisi
              </h1>
              <p className="mb-8 max-w-sm text-center text-sm text-slate-400">
                Alfred vazifalar, jamoa yuklamasi va rejalar bo'yicha savollarga
                javob beradi.
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

                  {msg.proposal?.actions?.length > 0 &&
                    msg.messageId &&
                    !resolvedProposals[msg.messageId] && (
                      <div className="ml-10 mt-2">
                        <ProposalDisplay
                          proposal={msg.proposal}
                          isExecuting={executingAction === msg.messageId}
                          onExecute={() =>
                            handleExecuteAction(msg.proposal, msg.messageId!)
                          }
                          onDismiss={() =>
                            handleDismissProposal(msg.messageId!)
                          }
                        />
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

        {/* Input bar */}
        <div className="px-4 pb-5 pt-2 sm:px-6">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 py-1.5 pl-4 pr-1.5 shadow-lg transition-colors focus-within:border-purple-500/60">
            <Sparkles className="h-5 w-5 shrink-0 text-purple-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Alfred'dan so'rang..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSend()}
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
      </div>
    </>
  );
}

function ProposalDisplay({
  proposal,
  isExecuting,
  onExecute,
  onDismiss,
}: {
  proposal: any;
  isExecuting: boolean;
  onExecute: () => void;
  onDismiss: () => void;
}) {
  if (!proposal) return null;

  return (
    <Card className="border-purple-600/50 bg-purple-950/20 p-3 text-xs space-y-2">
      <h4 className="font-semibold text-purple-300">{proposal.title}</h4>
      {proposal.description && (
        <p className="text-slate-300">{proposal.description}</p>
      )}
      {proposal.rationale && (
        <p className="text-slate-400">💡 {proposal.rationale}</p>
      )}

      <div className="space-y-1">
        {proposal.actions.map((action: any) => (
          <p key={action.id} className="text-slate-300">
            • {action.label}
          </p>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          className="flex-1 bg-green-600 hover:bg-green-700 text-xs h-8"
          onClick={onExecute}
          disabled={isExecuting}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Bajarilmoqda...
            </>
          ) : (
            "✅ Bajarish"
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-8"
          onClick={onDismiss}
          disabled={isExecuting}
        >
          ❌ Bekor qilish
        </Button>
      </div>
    </Card>
  );
}
