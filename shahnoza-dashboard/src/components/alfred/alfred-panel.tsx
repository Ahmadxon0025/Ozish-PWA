"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  AlertCircle,
  Loader2,
  ArrowUp,
  Users,
  ClipboardList,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

export function AlfredPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"chat" | "analysis" | "assign">(
    "chat"
  );

  const analysis = api.alfred.getAnalysis.useQuery();
  const knowledge = api.alfred.getKnowledge.useQuery();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h2 className="font-semibold text-white">Alfred</h2>
          <span className="hidden text-xs text-slate-400 sm:inline">
            Smart Assistant
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
          {(["chat", "analysis", "assign"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeTab === tab
                  ? "bg-purple-500/30 text-purple-200"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab === "chat" && "Chat"}
              {tab === "analysis" && "Analysis"}
              {tab === "assign" && "Assign"}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content — chat stays mounted so the conversation survives tab switches */}
      <div className="min-h-0 flex-1">
        <div className={activeTab === "chat" ? "h-full" : "hidden"}>
          <ChatTab />
        </div>
        {activeTab === "analysis" && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
              <AnalysisTab analysis={analysis} knowledge={knowledge} />
            </div>
          </div>
        )}
        {activeTab === "assign" && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
              <AssignTab />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

function ChatTab() {
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
  const alfredChat = api.alfred.chat.useMutation();
  const executeActionMutation = api.alfred.executeAction.useMutation();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        conversationHistory,
      });

      if (response.success) {
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

  const handleExecuteAction = async (
    proposal: any,
    messageId: string,
    confirmed: boolean
  ) => {
    if (!confirmed || !conversationId || !proposal?.actions) return;

    setExecutingAction(messageId);

    try {
      for (const action of proposal.actions) {
        await executeActionMutation.mutateAsync({
          conversationId,
          actionId: action.id || `action_${Date.now()}`,
          actionType: action.type,
          data: action.data || {},
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "alfred",
          content: `✅ ${proposal.actions.length} action(s) executed successfully!`,
        },
      ]);

      toast({
        title: "Actions executed",
        description: `${proposal.actions.length} action(s) have been completed.`,
        variant: "success",
      });
    } catch (error) {
      console.error("Action execution error:", error);
      toast({
        title: "Execution failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Messages / hero */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/20">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="mb-2 text-center text-3xl font-bold text-white sm:text-4xl">
              Jamoangizning aqlli yordamchisi
            </h1>
            <p className="mb-8 max-w-md text-center text-slate-400">
              Alfred vazifalar, jamoa yuklamasi va rejalar bo'yicha tahlil
              qiladi va tavsiyalar beradi.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {SUGGESTIONS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  onClick={() => handleSend(label)}
                  className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-purple-500/50 hover:bg-slate-800 hover:text-white"
                >
                  <Icon className="h-4 w-4 text-purple-400" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
            {messages.map((msg, i) => (
              <div key={i}>
                <div
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "alfred" && (
                    <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
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

                {msg.proposal && msg.messageId && (
                  <div className="ml-10 mt-2">
                    <ProposalDisplay
                      proposal={msg.proposal}
                      messageId={msg.messageId!}
                      isExecuting={executingAction === msg.messageId}
                      onExecute={() =>
                        handleExecuteAction(msg.proposal, msg.messageId!, true)
                      }
                    />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
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
      <div className="px-4 pb-6 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 py-2 pl-4 pr-2 shadow-lg transition-colors focus-within:border-purple-500/60">
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
    </div>
  );
}

function AnalysisTab({ analysis, knowledge }: any) {
  const isLoading = analysis.isLoading || knowledge.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  const analysisData = analysis.data;
  const knowledgeData = knowledge.data?.knowledge;

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        <p>
          Alfred's latest analysis
          {analysisData?.timestamp && (
            <span>
              {" "}
              from {new Date(analysisData.timestamp).toLocaleTimeString()}
            </span>
          )}
        </p>
      </div>

      {/* Key Metrics */}
      {analysisData?.userWorkloads && (
        <Card className="border-slate-700 bg-slate-800/50 p-3">
          <h3 className="text-sm font-medium text-white mb-2">Team Status</h3>
          <div className="space-y-2 text-xs">
            {analysisData.userWorkloads.map((w: any) => (
              <div
                key={w.userId}
                className="flex items-center justify-between text-slate-300"
              >
                <span>{w.userName}</span>
                <span
                  className={
                    w.workloadStatus === "overloaded"
                      ? "text-red-400"
                      : w.workloadStatus === "light"
                      ? "text-green-400"
                      : "text-blue-400"
                  }
                >
                  {w.totalTasks} tasks ({w.workloadStatus})
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Critical Tasks */}
      {analysisData?.criticalTasks?.length > 0 && (
        <Card className="border-red-900/30 bg-red-950/20 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs">
              <h3 className="font-medium text-red-300 mb-1">
                {analysisData.criticalTasks.length} Critical Issues
              </h3>
              {analysisData.criticalTasks.slice(0, 3).map((t: any) => (
                <p key={t.taskId} className="text-red-200/80 mb-1">
                  "{t.taskTitle}" - {t.assigneeName}
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Knowledge Confidence */}
      {knowledgeData && (
        <Card className="border-slate-700 bg-slate-800/50 p-3">
          <h3 className="text-sm font-medium text-white mb-2">Learning</h3>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Confidence in recommendations:
            </span>
            <span className="text-purple-300 font-medium">
              {(knowledgeData.learningConfidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            More task history = better predictions
          </p>
        </Card>
      )}

      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => {
          // Trigger fresh analysis
          toast({ title: "Alfred is analyzing...", variant: "default" });
        }}
      >
        Refresh Analysis
      </Button>
    </div>
  );
}

function AssignTab() {
  const [taskTitle, setTaskTitle] = useState("");
  const [hours, setHours] = useState("8");
  const [category, setCategory] = useState("general");

  const smartAssign = api.alfred.smartAssign.useQuery(
    {
      title: taskTitle,
      estimate_hours: taskTitle ? Number(hours) : undefined,
      category,
    },
    { enabled: taskTitle.length > 0 }
  );

  const recommendations = smartAssign.data?.analysis?.recommendations || [];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Task title..."
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500"
        />
        <input
          type="number"
          placeholder="Hours estimate"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500"
          min="0"
          step="0.5"
        />
      </div>

      {smartAssign.isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-slate-300">
            Top Recommendations
          </h3>
          {recommendations.slice(0, 3).map((rec: any) => (
            <Card
              key={rec.userId}
              className={`border p-2 cursor-pointer transition-colors ${
                rec.role === "optimal"
                  ? "border-green-600/50 bg-green-950/20 hover:bg-green-950/40"
                  : "border-slate-600 bg-slate-800/50 hover:bg-slate-800"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">
                  {rec.userName}
                </span>
                <span className="text-xs font-bold text-purple-300">
                  {rec.score}%
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {rec.reasoning[0] || "Suitable for this task"}
              </p>
              {rec.risks.length > 0 && (
                <p className="text-xs text-red-400 mt-1">⚠️ {rec.risks[0]}</p>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="w-full mt-2 h-7 text-xs"
                onClick={() => {
                  toast({
                    title: "Assigned to " + rec.userName,
                    description: "Task assignment in progress",
                    variant: "success",
                  });
                }}
              >
                Assign to {rec.userName}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {!taskTitle && (
        <p className="text-sm text-slate-400 text-center py-4">
          Enter a task title to see recommendations
        </p>
      )}
    </div>
  );
}

function ProposalDisplay({
  proposal,
  messageId,
  isExecuting,
  onExecute,
}: {
  proposal: any;
  messageId: string;
  isExecuting: boolean;
  onExecute: () => void;
}) {
  if (!proposal) return null;

  return (
    <Card className="border-purple-600/50 bg-purple-950/20 p-3 text-xs space-y-2">
      <h4 className="font-semibold text-purple-300">{proposal.title}</h4>
      <p className="text-slate-300">{proposal.description}</p>

      {proposal.rationale && (
        <p className="text-slate-400">💡 {proposal.rationale}</p>
      )}

      {proposal.risks && proposal.risks.length > 0 && (
        <div>
          {proposal.risks.map((risk: string, i: number) => (
            <p key={i} className="text-red-400">
              ⚠️ {risk}
            </p>
          ))}
        </div>
      )}

      {proposal.alternatives && proposal.alternatives.length > 0 && (
        <div className="text-slate-400">
          <p className="font-semibold mb-1">🔄 Alternatives:</p>
          {proposal.alternatives.map((alt: string, i: number) => (
            <p key={i} className="ml-2">
              • {alt}
            </p>
          ))}
        </div>
      )}

      {proposal.actions && proposal.actions.length > 0 && (
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
                Executing...
              </>
            ) : (
              "✅ Go ahead"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8"
            disabled={isExecuting}
          >
            🔄 Modify
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8"
            disabled={isExecuting}
          >
            ❌ Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
