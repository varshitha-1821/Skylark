// app/api/test-monday/route.ts
import { fetchCleanBoardItems } from "@/lib/monday";
import { cleanDeals } from "@/lib/clean";
import { NextResponse } from "next/server";

export async function GET() {
  const raw = await fetchCleanBoardItems(process.env.DEALS_BOARD_ID as string);
  const deals = cleanDeals(raw);

  const openMining = deals.filter((d) => d.sector === "Mining" && d.status === "Open");

  return NextResponse.json({
    openMiningCount: openMining.length,
    tentativeCloseDates: openMining.map((d) => ({
      name: d.dealName,
      tentativeCloseDate: d.tentativeCloseDate,
      dealStage: d.dealStage,
    })),
  });
}