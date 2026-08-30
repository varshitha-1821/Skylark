// lib/aggregate.ts
// Pre-computed summaries the agent can pull from instead of doing
// math itself. All aggregations explicitly report how many rows had
// missing data for the field being summed/grouped, so caveats are
// never lost.

type Deal = ReturnType<typeof import("./clean").cleanDeals> extends (infer T)[] ? T : never;
type WorkOrder = ReturnType<typeof import("./clean").cleanWorkOrders> extends (infer T)[] ? T : never;

// Groups deals by any field (e.g. sector, dealStage, status) and
// returns count + total value per group. Rows with a null grouping
// field go into an "Unspecified" bucket instead of being silently
// dropped.
export function groupDealsBy(deals: Deal[], field: keyof Deal) {
  const groups: Record<string, { count: number; totalValue: number; missingValueCount: number }> = {};

  for (const deal of deals) {
    const key = (deal[field] as string | null) ?? "Unspecified";
    if (!groups[key]) groups[key] = { count: 0, totalValue: 0, missingValueCount: 0 };

    groups[key].count += 1;
    if (deal.dealValue !== null) {
      groups[key].totalValue += deal.dealValue;
    } else {
      groups[key].missingValueCount += 1;
    }
  }

  return groups;
}

export function groupWorkOrdersBy(orders: WorkOrder[], field: keyof WorkOrder) {
  const groups: Record<string, { count: number; totalBilled: number; missingAmountCount: number }> = {};

  for (const order of orders) {
    const key = (order[field] as string | null) ?? "Unspecified";
    if (!groups[key]) groups[key] = { count: 0, totalBilled: 0, missingAmountCount: 0 };

    groups[key].count += 1;
    if (order.amountExclGst !== null) {
      groups[key].totalBilled += order.amountExclGst;
    } else {
      groups[key].missingAmountCount += 1;
    }
  }

  return groups;
}

// Pipeline health snapshot: open deals only, grouped by stage.
export function pipelineHealth(deals: Deal[]) {
  const open = deals.filter((d) => d.status === "Open");
  return {
    totalOpenDeals: open.length,
    totalOpenValue: open.reduce((sum, d) => sum + (d.dealValue ?? 0), 0),
    missingValueCount: open.filter((d) => d.dealValue === null).length,
    byStage: groupDealsBy(open, "dealStage"),
  };
}

// Matches each Deal to its corresponding Work Order by name, so we
// can answer questions that span both boards (e.g. "which won deals
// don't have a work order started yet?").
export function joinDealsToWorkOrders(deals: Deal[], orders: WorkOrder[]) {
  const orderByName = new Map<string, WorkOrder[]>();
  for (const order of orders) {
    const key = order.dealName?.trim().toLowerCase() ?? "";
    if (!orderByName.has(key)) orderByName.set(key, []);
    orderByName.get(key)!.push(order);
  }

  return deals.map((deal) => ({
    deal,
    matchedWorkOrders: orderByName.get(deal.dealName?.trim().toLowerCase() ?? "") ?? [],
  }));
}