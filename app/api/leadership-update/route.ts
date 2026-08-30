import { NextResponse } from "next/server";
import { getDealsAndOrders } from "@/lib/data";
import { pipelineHealth, groupDealsBy, groupWorkOrdersBy, joinDealsToWorkOrders } from "@/lib/aggregate";
import { dataQualityReport } from "@/lib/clean";

export async function GET() {
  try {
    const { deals, orders } = await getDealsAndOrders();

    const pipeline = pipelineHealth(deals);
    const dealsBySector = groupDealsBy(deals, "sector");
    const dealsByStatus = groupDealsBy(deals, "status");
    const ordersByStatus = groupWorkOrdersBy(orders, "executionStatus");

    const joined = joinDealsToWorkOrders(deals, orders);
    const wonWithoutWorkOrder = joined.filter(
      (j) => j.deal.status === "Won" && j.matchedWorkOrders.length === 0
    ).length;

    const dealsQuality = dataQualityReport(deals as any, ["closureProbability", "dealValue", "productDeal", "sector"]);
    const ordersQuality = dataQualityReport(orders as any, ["executionStatus", "amountExclGst", "billingStatus", "invoiceStatus"]);

    const totalWon = deals.filter((d) => d.status === "Won").length;
    const totalDead = deals.filter((d) => d.status === "Dead").length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      pipeline,
      dealsBySector,
      dealsByStatus,
      ordersByStatus,
      risks: {
        wonDealsWithoutWorkOrder: wonWithoutWorkOrder,
        totalWonDeals: totalWon,
        totalDeadDeals: totalDead,
      },
      dataQuality: {
        deals: dealsQuality,
        workOrders: ordersQuality,
      },
    });
  } catch (err: any) {
    console.error("Leadership update error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}