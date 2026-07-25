"use client";

import { useState } from "react";
import { X, Sparkles, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

export function AlfredPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"analysis" | "assign" | "chat">(
    "analysis"
  );

  const analysis = api.alfred.getAnalysis.useQuery();
  const knowledge = api.alfred.getKnowledge.useQuery();

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-96 max-w-[90vw] overflow-y-auto bg-slate-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 border-b border-slate-700 bg-slate-900 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h2 className="font-semibold text-white">Alfred</h2>
            <span className="text-xs text-slate-400">Smart Assistant</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-700 flex gap-1 px-4 py-3">
          {["analysis", "assign", "chat"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`text-sm px-3 py-1.5 rounded transition-colors ${
                activeTab === tab
                  ? "bg-purple-500/30 text-purple-300"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              {tab === "analysis" && "Analysis"}
              {tab === "assign" && "Assign"}
              {tab === "chat" && "Chat"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === "analysis" && (
            <AnalysisTab analysis={analysis} knowledge={knowledge} />
          )}
          {activeTab === "assign" && <AssignTab />}
          {activeTab === "chat" && <ChatTab />}
        </div>
      </div>
    </>
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
              from{" "}
              {new Date(analysisData.timestamp).toLocaleTimeString()}
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
                <span className={
                  w.workloadStatus === "overloaded"
                    ? "text-red-400"
                    : w.workloadStatus === "light"
                    ? "text-green-400"
                    : "text-blue-400"
                }>
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
                <p className="text-xs text-red-400 mt-1">
                  ⚠️ {rec.risks[0]}
                </p>
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

function ChatTab() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "alfred"; content: string }>
  >([
    {
      role: "alfred",
      content:
        "Hello! I'm Alfred, your task management AI. I can help you assign tasks, predict deadlines, analyze team workload, and more. What would you like help with?",
    },
  ]);

  const handleSend = () => {
    if (!message.trim()) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      {
        role: "alfred",
        content: `I understand you want to: "${message}". This feature is coming soon!`,
      },
    ]);
    setMessage("");
  };

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-purple-600 text-white"
                  : "bg-slate-800 text-slate-200"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-700 pt-3 flex gap-2">
        <input
          type="text"
          placeholder="Ask Alfred..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!message.trim()}
          className="bg-purple-600 hover:bg-purple-700"
        >
          Send
        </Button>
      </div>
    </div>
  );
}
