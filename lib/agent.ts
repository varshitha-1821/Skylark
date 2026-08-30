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

const SYSTEM_PROMPT = `You are the Skylark BI Copilot, a friendly and sharp business intelligence assistant for Skylark Drones' founders and executives.

Today's date is ${new Date().toDateString()}.

Rules:
- Always use the provided tools to fetch real data before answering -- never guess numbers.
- When a question mentions a sector and/or time period (e.g. "mining pipeline this quarter"), use get_filtered_pipeline for an EXACT answer instead of approximating with other tools.
- When a question is ambiguous in a way that would seriously change the answer, ask one short clarifying question instead of guessing.
- Always mention relevant data-quality caveats (e.g. "X% of records are missing this field") when they materially affect the answer.
- Give insights, not just numbers: point out what's notable, risky, or worth attention.
- Keep answers concise and founder-friendly -- no jargon, no walls of text.
- All monetary values are in Rupees.`;

export async function runAgent(
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[] = []
) {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  let lastToolName: string | null = null;
  let lastToolResult: any = null;

  for (let i = 0; i < 5; i++) {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages,
      tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    const toolCalls = choice.message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return { reply: choice.message.content, toolName: lastToolName, toolResult: lastToolResult };
    }

    messages.push(choice.message);

    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments || "{}");
      const result = await runTool(call.function.name, args);
      lastToolName = call.function.name;
      lastToolResult = result;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return {
    reply: "I wasn't able to finish gathering the data for that -- could you try rephrasing your question?",
    toolName: null,
    toolResult: null,
  };
}