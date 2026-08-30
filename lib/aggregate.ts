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

// --- Precise filtering, added to avoid the agent having to approximate ---

// Parses a quarter label like "Q3 2026" into its date range.
function getQuarterBounds(quarterLabel: string): { start: Date; end: Date } | null {
  const match = quarterLabel.match(/Q([1-4])\s*(\d{4})/i);
  if (!match) return null;
  const quarter = parseInt(match[1]);
  const year = parseInt(match[2]);
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 1),
  };
}

type DealFilter = {
  sector?: string;
  status?: string;
  dealStage?: string;
  closingQuarter?: string; // e.g. "Q3 2026" -- filtered against tentativeCloseDate
};

export function filterDeals(deals: Deal[], filter: DealFilter) {
  const quarterBounds = filter.closingQuarter ? getQuarterBounds(filter.closingQuarter) : null;

  return deals.filter((d) => {
    if (filter.sector && d.sector?.toLowerCase() !== filter.sector.toLowerCase()) return false;
    if (filter.status && d.status !== filter.status) return false;
    if (filter.dealStage && d.dealStage !== filter.dealStage) return false;
    if (quarterBounds) {
      if (!d.tentativeCloseDate) return false;
      const date = new Date(d.tentativeCloseDate);
      if (date < quarterBounds.start || date >= quarterBounds.end) return false;
    }
    return true;
  });
}

export function summarizeDeals(deals: Deal[]) {
  const withValue = deals.filter((d) => d.dealValue !== null);
  return {
    dealCount: deals.length,
    totalValue: withValue.reduce((sum, d) => sum + (d.dealValue ?? 0), 0),
    missingValueCount: deals.length - withValue.length,
    byStage: groupDealsBy(deals, "dealStage"),
    byStatus: groupDealsBy(deals, "status"),
  };
}

// Flags deals whose tentativeCloseDate has already passed while status
// is still Open -- a sign of a stale/un-updated pipeline entry rather
// than a genuinely empty pipeline.
export function findStaleOpenDeals(deals: Deal[], asOf: Date = new Date()) {
  return deals.filter((d) => {
    if (d.status !== "Open" || !d.tentativeCloseDate) return false;
    return new Date(d.tentativeCloseDate) < asOf;
  });
}