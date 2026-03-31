import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const save = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("stocks", {
      ...args,
      collected_at: Date.now(),
    });
  },
});

export const getLatest = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stocks")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol.toUpperCase()))
      .order("desc")
      .first();
  },
});

export const getHistory = query({
  args: { symbol: v.string(), limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("stocks")
      .withIndex("by_symbol_time", (q) =>
        q.eq("symbol", args.symbol.toUpperCase())
      )
      .order("desc")
      .take(args.limit ?? 100);
    return results.reverse();
  },
});
