import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }
    const result = await runAgent(message, history ?? []);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Chat route error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}