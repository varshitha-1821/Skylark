// app/api/test-monday/route.ts
import { fetchCleanBoardItems } from "@/lib/monday";
import { cleanDeals, cleanWorkOrders } from "@/lib/clean";
import { pipelineHealth, groupWorkOrdersBy, joinDealsToWorkOrders } from "@/lib/aggregate";
import { NextResponse } from "next/server";

export async function GET() {
  const [rawDeals, rawOrders] = await Promise.all([
    fetchCleanBoardItems(process.env.DEALS_BOARD_ID as string),
    fetchCleanBoardItems(process.env.WORK_ORDERS_BOARD_ID as string),
  ]);

  const deals = cleanDeals(rawDeals);
  const orders = cleanWorkOrders(rawOrders);

  const joined = joinDealsToWorkOrders(deals, orders);
  const wonDealsWithNoWorkOrder = joined.filter(
    (j) => j.deal.status === "Won" && j.matchedWorkOrders.length === 0
  ).length;

  return NextResponse.json({
    pipeline: pipelineHealth(deals),
    workOrdersBySector: groupWorkOrdersBy(orders, "sector"),
    wonDealsWithNoWorkOrder,
  });
}