import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  stocks: defineTable({
    symbol: v.string(),
    name: v.optional(v.string()),
    current_price: v.optional(v.float64()),
    previous_close: v.optional(v.float64()),
    open: v.optional(v.float64()),
    day_high: v.optional(v.float64()),
    day_low: v.optional(v.float64()),
    volume: v.optional(v.float64()),
    market_cap: v.optional(v.float64()),
    change_percent: v.optional(v.float64()),
    currency: v.optional(v.string()),
    exchange: v.optional(v.string()),
    sector: v.optional(v.string()),
    industry: v.optional(v.string()),
    source: v.optional(v.string()),
    collected_at: v.float64(),
  }).index("by_symbol", ["symbol"])
    .index("by_symbol_time", ["symbol", "collected_at"]),

  search_history: defineTable({
    query: v.string(),
    symbol: v.string(),
    searched_at: v.float64(),
  }).index("by_time", ["searched_at"]),
});
