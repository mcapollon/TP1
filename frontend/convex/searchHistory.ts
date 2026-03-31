import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const log = mutation({
  args: {
    query: v.string(),
    symbol: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("search_history", {
      query: args.query,
      symbol: args.symbol,
      searched_at: Date.now(),
    });
  },
});

export const recent = query({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("search_history")
      .withIndex("by_time")
      .order("desc")
      .take(args.limit ?? 10);
  },
});
