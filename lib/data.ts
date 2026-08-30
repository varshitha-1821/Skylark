// lib/data.ts
// Central place to get cleaned deals + work orders, cached briefly
// so multiple tool calls in one agent turn don't re-fetch from
// monday.com every time.

import { fetchCleanBoardItems } from "./monday";
import { cleanDeals, cleanWorkOrders } from "./clean";

let cache: {
  deals: ReturnType<typeof cleanDeals>;
  orders: ReturnType<typeof cleanWorkOrders>;
  fetchedAt: number;
} | null = null;

const CACHE_TTL_MS = 60_000; // 1 minute

export async function getDealsAndOrders() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  const [rawDeals, rawOrders] = await Promise.all([
    fetchCleanBoardItems(process.env.DEALS_BOARD_ID as string),
    fetchCleanBoardItems(process.env.WORK_ORDERS_BOARD_ID as string),
  ]);
  const deals = cleanDeals(rawDeals);
  const orders = cleanWorkOrders(rawOrders);
  cache = { deals, orders, fetchedAt: Date.now() };
  return cache;
}