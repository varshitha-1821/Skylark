// lib/agent.ts
// The agent's "brain": defines the tools the LLM can call, and runs
// the tool-calling loop until it produces a final answer.

import Groq from "groq-sdk";
import { getDealsAndOrders } from "./data";
import { groupDealsBy, groupWorkOrdersBy, pipelineHealth, joinDealsToWorkOrders, filterDeals, summarizeDeals, findStaleOpenDeals } from "./aggregate";
import { dataQualityReport } from "./clean";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_pipeline_health",
      description:
        "Get a snapshot of currently OPEN sales deals: total count, total value, and a breakdown by deal stage. Use for any question about pipeline status or sales funnel health.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_filtered_pipeline",
      description:
        "Get an EXACT summary of deals filtered by sector, status, deal stage, and/or a specific closing quarter. Use this whenever a question mentions a specific sector and/or time period (e.g. 'mining pipeline this quarter') instead of approximating from other tools.",
      parameters: {
        type: "object",
        properties: {
          sector: { type: "string", description: "e.g. Mining, Renewables, Powerline, Railways" },
          status: { type: "string", enum: ["Open", "Won", "Dead", "On Hold"] },
          dealStage: { type: "string", description: "e.g. 'F. Negotiations'" },
          closingQuarter: {
            type: "string",
            description: "Format 'Q<1-4> <year>', e.g. 'Q3 2026'. Compute this yourself from today's date if the user says 'this quarter' or similar.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_deals_summary",
      description:
        "Group ALL deals (any status: Open, Won, Dead, On Hold) by a chosen field, with counts + total value per group. Use for sector performance, win/loss breakdowns, or stage distribution.",
      parameters: {
        type: "object",
        properties: {
          groupBy: {
            type: "string",
            enum: ["sector", "status", "dealStage", "ownerCode"],
            description: "Field to group deals by",
          },
        },
        required: ["groupBy"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_work_orders_summary",
      description:
        "Group work orders by a chosen field, with counts + total billed amount per group. Use for operational/execution questions, billing status, or sector project volume.",
      parameters: {
        type: "object",
        properties: {
          groupBy: {
            type: "string",
            enum: ["sector", "executionStatus", "billingStatus"],
            description: "Field to group work orders by",
          },
        },
        required: ["groupBy"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_data_quality_report",
      description:
        "Check what % of records are missing key fields, for 'deals' or 'workOrders'. Use whenever an answer should be caveated with data completeness info.",
      parameters: {
        type: "object",
        properties: { board: { type: "string", enum: ["deals", "workOrders"] } },
        required: ["board"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_won_deals_without_work_order",
      description:
        "Count won deals with no matching work order (matched by deal name, not a unique ID -- treat as approximate, not exact).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

async function runTool(name: string, args: any) {
  const { deals, orders } = await getDealsAndOrders();

  switch (name) {
    case "get_pipeline_health":
      return pipelineHealth(deals);
    case "get_deals_summary":
      return groupDealsBy(deals, args.groupBy);
    case "get_work_orders_summary":
      return groupWorkOrdersBy(orders, args.groupBy);
    case "get_data_quality_report":
      return args.board === "deals"
        ? dataQualityReport(deals as any, ["closureProbability", "dealValue", "productDeal", "sector"])
        : dataQualityReport(orders as any, ["executionStatus", "amountExclGst", "billingStatus", "invoiceStatus"]);
    case "get_won_deals_without_work_order": {
      const joined = joinDealsToWorkOrders(deals, orders);
      const count = joined.filter((j) => j.deal.status === "Won" && j.matchedWorkOrders.length === 0).length;
      const totalWon = deals.filter((d) => d.status === "Won").length;
      return {
        wonDealsWithNoMatchedWorkOrder: count,
        totalWonDeals: totalWon,
        note: "Matching is by deal name, not a unique ID -- treat as approximate.",
      };
    }
    case "get_filtered_pipeline": {
      const filtered = filterDeals(deals, args);
      const result: any = summarizeDeals(filtered);

      if (args.closingQuarter) {
        const sectorAllOpen = deals.filter(
          (d) => d.status === "Open" && (!args.sector || d.sector?.toLowerCase() === args.sector.toLowerCase())
        );
        const stale = findStaleOpenDeals(sectorAllOpen);
        result.contextNote = {
          totalOpenDealsInSectorRegardlessOfQuarter: sectorAllOpen.length,
          openDealsWithPastTentativeCloseDate: stale.length,
          note:
            stale.length > 0
              ? "These deals are still marked Open but their tentative close date has already passed -- likely stale/un-updated records, not a genuinely empty pipeline."
              : undefined,
        };
      }

      return result;
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function isGroupMap(obj: any): boolean {
  return (
    obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    Object.values(obj).some(
      (v) => v && typeof v === "object" && ("totalValue" in (v as any) || "totalBilled" in (v as any))
    )
  );
}

function groupToChartArray(group: Record<string, any>): { name: string; value: number }[] {
  return Object.entries(group).map(([name, v]: [string, any]) => ({
    name,
    value: v.totalValue ?? v.totalBilled ?? 0,
  }));
}

function prettyLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// Fallback: chart any top-level numeric fields directly (e.g. dealCount,
// totalValue, missingValueCount) when there's no group breakdown. Needs
// at least 2 numbers -- a single value has nothing to compare against.
function extractScalarChart(obj: any): { name: string; value: number }[] | null {
  if (!obj || typeof obj !== "object") return null;
  const numeric = Object.entries(obj).filter(([, v]) => typeof v === "number");
  if (numeric.length < 2) return null;
  return numeric.map(([k, v]) => ({ name: prettyLabel(k), value: v as number }));
}

// Extracts the best chartable {name,value}[] from a tool result: prefer
// a group breakdown (sector/stage/status), then a nested byStage/byStatus,
// then fall back to top-level numeric fields.
function buildChartData(result: any): { name: string; value: number }[] | null {
  if (!result || typeof result !== "object") return null;
  if (isGroupMap(result)) return groupToChartArray(result);
  if (isGroupMap(result.byStage)) return groupToChartArray(result.byStage);
  if (isGroupMap(result.byStatus)) return groupToChartArray(result.byStatus);
  return extractScalarChart(result);
}

const SYSTEM_PROMPT = `You are the Skylark BI Copilot, a friendly and sharp business intelligence assistant for Skylark Drones' founders and executives.

Today's date is ${new Date().toDateString()}.

Rules:
- Always use the provided tools to fetch real data before answering -- never guess numbers.
- When a question mentions a sector and/or time period (e.g. "mining pipeline this quarter"), use get_filtered_pipeline for an EXACT answer instead of approximating with other tools.
- If a short or vague question could reasonably map to a tool with a sensible default (e.g. "mining sector information" -> get_filtered_pipeline with sector "Mining"), just call it -- do not ask for clarification on the first pass.
- Ask at most ONE clarifying question total per user request, and only if you genuinely cannot pick any reasonable tool call. After that one clarification (or if none is needed), commit to your best interpretation and answer -- do not ask a second clarifying question in the same topic.
- As soon as you have tool results that reasonably answer the question, respond with final text immediately. Do not call additional tools "just in case" unless the question explicitly needs another board's data.
- Always mention relevant data-quality caveats (e.g. "X% of records are missing this field") when they materially affect the answer.
- Give insights, not just numbers: point out what's notable, risky, or worth attention.
- Keep answers concise and founder-friendly -- no jargon, no walls of text.
- All monetary values are in Rupees.
- Never generate your own charts, graphs, tables-as-images, mermaid diagrams, ASCII charts, or links to external chart-generation services (e.g. quickchart.io). You cannot render visuals yourself.
- If the user asks for a chart, graph, or visualization, mention that it's shown above your reply -- the frontend renders it automatically, you never need to produce it yourself.`;

const MAX_TURNS = 8;

export async function runAgent(
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[] = []
) {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const toolLog: any[] = [];

  for (let i = 0; i < MAX_TURNS; i++) {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages,
      tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    const toolCalls = choice.message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const chartData = [...toolLog].reverse().map(buildChartData).find((c) => c !== null) ?? null;
      return { reply: choice.message.content, chartData };
    }

    messages.push(choice.message);

    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments || "{}");
      const result = await runTool(call.function.name, args);
      toolLog.push(result);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  const chartData = [...toolLog].reverse().map(buildChartData).find((c) => c !== null) ?? null;
  return {
    reply: "I wasn't able to fully finish gathering data for that -- could you try a more specific question, e.g. naming a sector or metric?",
    chartData,
  };
}