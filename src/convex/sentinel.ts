import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { generateSampleSessions } from "../lib/sentinel/samples";
import { scoreAllSessions } from "../lib/sentinel/engine";

/** The sample archive is deterministic — score it once per server instance. */
let scoredCache: ReturnType<typeof scoreAllSessions> | null = null;
function scoredSessions() {
  if (scoredCache === null) {
    scoredCache = scoreAllSessions(generateSampleSessions());
  }
  return scoredCache;
}

/**
 * Public query: every scored session as a serializable dossier summary.
 * The ML runs in-process; only the small result shape crosses the wire.
 */
export const listSessions = query({
  args: {},
  handler: async () => {
    const results = scoredSessions();
    return results.map((r) => ({
      sessionId: r.session.id,
      user: r.session.user,
      ts: r.session.ts,
      ip: r.session.ip,
      city: r.session.city,
      country: r.session.country,
      device: r.session.device,
      browser: r.session.browser,
      score: r.score,
      verdict: r.verdict,
      headline: r.headline,
      anomalyVote: r.anomalyVote,
      factors: r.factors,
      downloads: r.session.fileDownloads,
      apiCalls: r.session.apiCalls,
      attackStory: r.session.attackStory ?? false,
      notes: r.session.notes,
    }));
  },
});

/** Public query: users with aggregate risk for the watchlist rail. */
export const listUsers = query({
  args: {},
  handler: async () => {
    const results = scoredSessions();
    const byUser = new Map<
      string,
      { user: string; maxScore: number; sessions: number }
    >();
    for (const r of results) {
      const cur = byUser.get(r.session.user) ?? {
        user: r.session.user,
        maxScore: 0,
        sessions: 0,
      };
      cur.maxScore = Math.max(cur.maxScore, r.score);
      cur.sessions += 1;
      byUser.set(r.session.user, cur);
    }
    return [...byUser.values()];
  },
});

/** Public query: one session's full dossier (factors + notes). */
export const getSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const results = scoredSessions();
    const r = results.find((x) => x.session.id === args.sessionId);
    if (!r) return null;
    return {
      sessionId: r.session.id,
      user: r.session.user,
      ts: r.session.ts,
      ip: r.session.ip,
      city: r.session.city,
      country: r.session.country,
      device: r.session.device,
      browser: r.session.browser,
      score: r.score,
      verdict: r.verdict,
      headline: r.headline,
      anomalyVote: r.anomalyVote,
      factors: r.factors,
      downloads: r.session.fileDownloads,
      uploads: r.session.fileUploads,
      apiCalls: r.session.apiCalls,
      sensitiveResources: r.session.sensitiveResources,
      privilegedActions: r.session.privilegedActions,
      authPassed: r.session.authPassed,
      notes: r.session.notes,
      baseline: {
        homeCity: r.baseline.homeCity,
        homeCountry: r.baseline.homeCountry,
        homeTzLabel: r.baseline.homeTzLabel,
        homeTzOffset: r.baseline.homeTzOffset,
        loginHourStart: r.baseline.loginHourStart,
        loginHourEnd: r.baseline.loginHourEnd,
        devices: r.baseline.devices,
        downloadsMax: r.baseline.downloadsMax,
        apiCallsMax: r.baseline.apiCallsMax,
        familiarResources: r.baseline.familiarResources,
        familiarActions: r.baseline.familiarActions,
        sessionsScored: r.baseline.sessionsScored,
        lastActiveTs: r.baseline.lastActiveTs,
    },
    };
  },
});

/** Public query: persisted SOC actions (blocked users, memos). */
export const listCases = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sentinelCases").collect();
  },
});

/** Record the automatic verdict dispatch for a session (idempotent-ish). */
export const recordCase = mutation({
  args: {
    sessionId: v.string(),
    user: v.string(),
    ts: v.number(),
    score: v.number(),
    verdict: v.string(),
    headline: v.string(),
    anomalyVote: v.number(),
    dispatched: v.string(),
    factors: v.array(
      v.object({
        code: v.string(),
        label: v.string(),
        weight: v.number(),
        detail: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sentinelCases")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("sentinelCases", {
      ...args,
      reviewed: false,
      blocked: false,
    });
  },
});

/** Analyst pressed "Block User" — persists the block stamp. */
export const blockUser = mutation({
  args: { sessionId: v.string(), user: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sentinelCases")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { blocked: true, reviewed: true });
      return existing._id;
    }
    return ctx.db.insert("sentinelCases", {
      sessionId: args.sessionId,
      user: args.user,
      ts: Date.now(),
      score: 0,
      verdict: "block",
      headline: "Blocked by analyst",
      anomalyVote: 0,
      dispatched: "Blocked manually by the analyst on duty.",
      factors: [],
      reviewed: true,
      blocked: true,
    });
  },
});

/** Analyst pressed "Mark Reviewed" — closes the case without blocking. */
export const markReviewed = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sentinelCases")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { reviewed: true });
      return existing._id;
    }
    return ctx.db.insert("sentinelCases", {
      sessionId: args.sessionId,
      user: "unknown",
      ts: 0,
      score: 0,
      verdict: "allow",
      headline: "Reviewed by analyst",
      anomalyVote: 0,
      dispatched: "Marked reviewed by the analyst on duty.",
      factors: [],
      reviewed: true,
      blocked: false,
    });
  },
});

/**
 * LLM Security Analyst — converts the technical dossier into a plain-language
 * incident memo. Requires OPENAI_API_KEY in the deployment environment.
 */
export const explainCase = action({
  args: {
    sessionId: v.string(),
    user: v.string(),
    score: v.number(),
    verdict: v.string(),
    headline: v.string(),
    factors: v.array(
      v.object({
        code: v.string(),
        label: v.string(),
        weight: v.number(),
        detail: v.string(),
      }),
    ),
    notes: v.array(v.string()),
    baselineSummary: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Must be signed in to summon the analyst.");
    }

    // Mark the case memo pending while the analyst works.
    await ctx.runMutation(api.sentinel.patchMemoState, {
      sessionId: args.sessionId,
      memoState: "pending",
    });

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = [
      `Security session under review — verdict ${args.verdict.toUpperCase()}, risk ${args.score}/100.`,
      `User: ${args.user}. Headline: ${args.headline}`,
      `Baseline (normal behavior): ${args.baselineSummary}`,
      "Detected anomalies:",
      ...args.factors.map((f) => `- ${f.label} (weight ${f.weight}): ${f.detail}`),
      "Raw log notes:",
      ...args.notes.map((n) => `- ${n}`),
    ].join("\n");

    let memo: string | undefined;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are the AI Security Analyst of SentinelAI, writing incident memos for a SOC watch room. " +
              "Given technical evidence, write a 3-5 sentence memo in a calm, archival tone " +
              "(the product uses a vintage paper aesthetic). " +
              "Explain WHY the session is suspicious in plain language for a non-technical reader, " +
              "reference the most damning numbers (times, multiples, distances), and end with one concrete recommended action. " +
              "Never invent facts not present in the evidence.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 320,
        temperature: 0.4,
      });
      memo = completion.choices[0]?.message?.content?.trim();
    } catch (err) {
      await ctx.runMutation(api.sentinel.patchMemoState, {
        sessionId: args.sessionId,
        memoState: "failed",
      });
      throw err;
    }
    if (!memo) {
      await ctx.runMutation(api.sentinel.patchMemoState, {
        sessionId: args.sessionId,
        memoState: "failed",
      });
      throw new Error("The analyst returned an empty memo.");
    }

    await ctx.runMutation(api.sentinel.saveMemo, {
      sessionId: args.sessionId,
      memo,
      memoModel: "gpt-4o-mini",
    });
    return memo;
  },
});


export const patchMemoState = mutation({
  args: { sessionId: v.string(), memoState: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sentinelCases")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { memoState: args.memoState });
  },
});

export const saveMemo = mutation({
  args: { sessionId: v.string(), memo: v.string(), memoModel: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sentinelCases")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        memo: args.memo,
        memoModel: args.memoModel,
        memoState: "ready",
      });
      return existing._id;
    }
    return ctx.db.insert("sentinelCases", {
      sessionId: args.sessionId,
      user: "",
      ts: 0,
      score: 0,
      verdict: "allow",
      headline: "",
      anomalyVote: 0,
      dispatched: "",
      factors: [],
      memo: args.memo,
      memoModel: args.memoModel,
      memoState: "ready",
      reviewed: false,
      blocked: false,
    });
  },
});
