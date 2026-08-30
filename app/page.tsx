"use client";

import { useState, useRef, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Msg = { role: "user" | "assistant"; content: string };
type ChatResponse = { reply: string; toolName: string | null; toolResult: any };

function toChartData(toolResult: any): { name: string; value: number }[] | null {
  if (!toolResult || typeof toolResult !== "object") return null;
  // groupDealsBy / groupWorkOrdersBy shape: { [key]: { count, totalValue|totalBilled, ... } }
  const entries = Object.entries(toolResult).filter(
    ([, v]) => v && typeof v === "object" && ("totalValue" in (v as any) || "totalBilled" in (v as any))
  );
  if (entries.length === 0) return null;
  return entries.map(([name, v]: [string, any]) => ({
    name,
    value: v.totalValue ?? v.totalBilled ?? 0,
  }));
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chart, setChart] = useState<{ name: string; value: number }[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: newMessages.slice(0, -1) }),
      });
      const data: ChatResponse = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "Something went wrong." }]);
      setChart(toChartData(data.toolResult));
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error reaching the agent. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col h-screen bg-slate-950 text-slate-100">
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

        {chart && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "none" }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {loading && <div className="text-slate-500 text-sm">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

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