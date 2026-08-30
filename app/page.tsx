"use client";

import { useState, useRef, useEffect } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Msg = { role: "user" | "assistant"; content: string };
type ChatResponse = { reply: string; chartData: { name: string; value: number }[] | null };

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chart, setChart] = useState<{ name: string; value: number }[] | null>(null);
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");
  const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];
  const bottomRef = useRef<HTMLDivElement>(null);

  const [leadership, setLeadership] = useState<any>(null);
  const [leadershipLoading, setLeadershipLoading] = useState(false);
  const [showLeadershipPanel, setShowLeadershipPanel] = useState(false);

  async function generateLeadershipUpdate() {
    setLeadershipLoading(true);
    try {
      const res = await fetch("/api/leadership-update");
      const data = await res.json();
      setLeadership(data);
    } catch {
      setLeadership({ error: "Failed to generate update." });
    } finally {
      setLeadershipLoading(false);
    }
  }

  async function toggleLeadershipPanel() {
    if (!leadership) await generateLeadershipUpdate();
    setShowLeadershipPanel((s) => !s);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chart]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setChart(null);
    setChartType("bar");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: newMessages.slice(0, -1) }),
      });
      const data: ChatResponse = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "Something went wrong." }]);
      setChart(data.chartData ?? null);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error reaching the agent. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex flex-col h-screen bg-slate-950 text-slate-100">
      <header className="px-6 py-4 border-b border-slate-800">
        <h1 className="text-lg font-semibold">Skylark BI Copilot</h1>
        <p className="text-sm text-slate-400">Ask about your pipeline or work orders</p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 whitespace-pre-wrap text-sm ${
                m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {chart && chart.length >= 2 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-end gap-2 mb-2">
  <span className="text-xs text-slate-400 mr-1">Representation:</span>
  <button
    onClick={() => setChartType("bar")}
    className={`text-xs px-3 py-1 rounded-full ${
      chartType === "bar" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
    }`}
  >
     Bar Graph
  </button>
  <button
    onClick={() => setChartType("pie")}
    className={`text-xs px-3 py-1 rounded-full ${
      chartType === "pie" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
    }`}
  >
     Pie Chart
  </button>
</div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "bar" ? (
                  <BarChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} angle={-20} textAnchor="end" height={50} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "none" }} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={chart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => entry.name}
                    >
                      {chart.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1e293b", border: "none" }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {loading && <div className="text-slate-500 text-sm">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      {showLeadershipPanel && leadership && !leadership.error && (
        <div className="fixed bottom-40 right-6 z-20 w-80 bg-emerald-950/95 border border-emerald-800 rounded-xl p-4 text-sm space-y-2 shadow-2xl">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-emerald-300">📈 Leadership Update</h2>
            <button onClick={() => setShowLeadershipPanel(false)} className="text-slate-400 hover:text-slate-200 text-xs">
              ✕
            </button>
          </div>
          <p>
            <span className="text-slate-400">Open pipeline: </span>
            {leadership.pipeline.totalOpenDeals} deals, ₹{Math.round(leadership.pipeline.totalOpenValue).toLocaleString()}
          </p>
          <p>
            <span className="text-slate-400">Won deals without a work order: </span>
            {leadership.risks.wonDealsWithoutWorkOrder} / {leadership.risks.totalWonDeals}
          </p>
          <p className="text-slate-400 text-xs">
            Generated {new Date(leadership.generatedAt).toLocaleString()}
          </p>
        </div>
      )}

      <button
  onClick={toggleLeadershipPanel}
  disabled={leadershipLoading}
  title="Leadership Update"
  className="fixed bottom-24 right-6 z-20 flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 shadow-xl px-5 py-3 text-sm font-medium transition-transform hover:scale-105 whitespace-nowrap"
>
  <span className="text-xl"></span>
  {leadershipLoading ? "Loading..." : "Leadership Updates"}
</button>

      <div className="border-t border-slate-800 px-6 py-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. How is our pipeline looking for mining this quarter?"
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={send}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          Send
        </button>
      </div>
    </main>
  );
}