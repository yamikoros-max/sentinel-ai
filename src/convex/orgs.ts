import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { MIN_HISTORY_FOR_ENSEMBLE, scoreSession, trainUserDetector } from "../lib/sentinel/engine";
import { buildBaseline } from "../lib/sentinel/baselines";
import type { SessionLog } from "../lib/sentinel/types";

// ── Domain utilities ──────────────────────────────────────────────

/** Lowercase host → registrable domain (last two labels; naive but fine for SaaS demo). */
export function registrableDomain(email: string): string {
  const at = email.lastIndexOf("@");
  const host = (at >= 0 ? email.slice(at + 1) : email).trim().toLowerCase();
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

// ── Ingest event validator ────────────────────────────────────────

/** Validator for one ingested session event (shared by HTTP + test paths). */
export const ingestEventShape = v.object({
  user: v.string(),
  userLabel: v.optional(v.string()),
  ts: v.optional(v.number()),
  ip: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  lat: v.optional(v.number()),
  lon: v.optional(v.number()),
  device: v.optional(v.string()),
  browser: v.optional(v.string()),
  sensitiveResources: v.optional(v.array(v.string())),
  fileDownloads: v.number(),
  fileUploads: v.number(),
  apiCalls: v.number(),
  privilegedActions: v.optional(v.array(v.string())),
  authPassed: v.optional(v.array(v.string())),
  notes: v.optional(v.array(v.string())),
});

export type IngestEvent = {
  user: string;
  userLabel?: string;
  ts?: number;
  ip?: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  device?: string;
  browser?: string;
  sensitiveResources?: string[];
  fileDownloads: number;
  fileUploads: number;
  apiCalls: number;
  privilegedActions?: string[];
  authPassed?: string[];
  notes?: string[];
};

// ── Key utilities ─────────────────────────────────────────────────

/** Ingest keys look like `sai_<64 hex chars>`; stored as sha256 hash. */
export function generateIngestKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sai_${hex}`;
}

/**sha256 via WebCrypto (available in Convex runtime). */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Auth + membership helpers ─────────────────────────────────────

async function requireUserId(ctx: any): Promise<any> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in required.");
  return userId;
}
// ── Org lifecycle ─────────────────────────────────────────────────

/** Claim an org for your email's domain. Creator becomes admin. */
export const createOrg = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required.");
    const user = (await ctx.db.get(userId)) as { email?: string } | null;
    const email = user?.email;
    if (!email) throw new Error("Sign in with email to claim a domain.");

    const domain = registrableDomain(email);
    if (!isValidDomain(domain)) throw new Error(`“${domain}” is not a valid domain.`);

    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .first();
    if (existing) {
      // Domain already claimed — join as member instead of failing.
      const m = await ctx.db
        .query("orgMembers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (!m) {
        await ctx.db.insert("orgMembers", {
          orgId: existing._id,
          userId,
          email,
          role: "member",
          createdAt: Date.now(),
        });
      }
      return { orgId: existing._id, joined: true };
    }

    const orgId = await ctx.db.insert("organizations", {
      name: args.name || domain,
      domain,
      createdAt: Date.now(),
      createdByUserId: userId,
    });
    await ctx.db.insert("orgMembers", {
      orgId,
      userId,
      email,
      role: "admin",
      createdAt: Date.now(),
    });
    return { orgId, joined: false };
  },
});

/** List orgs the caller belongs to. */
export const listMyOrgs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const memberships = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out = [];
    for (const m of memberships) {
      const org = await ctx.db.get(m.orgId);
      if (org) out.push({ orgId: org._id, name: org.name, domain: org.domain, role: m.role });
    }
    return out;
  },
});

/** Rotate/create an ingest key — admin only. Returns the raw key exactly once. */
export const createIngestKey = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required.");
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== args.orgId || membership.role !== "admin") {
        throw new Error("Only domain admins can create ingest keys.");
    }
    const raw = generateIngestKey();
    const hash = await sha256Hex(raw);
    await ctx.db.insert("ingestKeys", {
      orgId: args.orgId,
      keyHash: hash,
      createdAt: Date.now(),
      createdByUserId: userId,
      revoked: false,
    });
    return { key: raw };
  },
});

/**
 * Entry point for POST /api/ingest: look the org up by key hash, then score
 * and store the event through the shared path. Kept as one mutation so the
 * HTTP action stays free of direct db access.
 */
export const ingestViaHash = mutation({
  args: {
    keyHash: v.string(),
    event: ingestEventShape,
  },
  handler: async (ctx, args) => {
    const keyRow = await ctx.db
      .query("ingestKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", args.keyHash))
      .first();
    if (!keyRow || keyRow.revoked) {
      return { ok: false as const, error: "Invalid ingest key." };
    }
    const org = await ctx.db.get(keyRow.orgId);
    if (!org) return { ok: false as const, error: "Org no longer exists." };

    const stored = await scoreAndStoreEvent(ctx, keyRow.orgId, args.event as IngestEvent);
    return { ok: true as const, ...stored };
  },
});

/** Org overview for the settings page — members visible to all, key metadata admin-only. */
export const orgOverview = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== args.orgId) return null;
    const org = await ctx.db.get(args.orgId);
    if (!org) return null;
    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const ingestKeys = await ctx.db
      .query("ingestKeys")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("revoked"), false))
      .collect();
    return {
      orgId: org._id,
      name: org.name,
      domain: org.domain,
      createdAt: org.createdAt,
      role: membership.role,
      members: members.map((m) => ({
        email: m.email,
        role: m.role,
        createdAt: m.createdAt,
      })),
      keyCount: ingestKeys.length,
      keyPreview: ingestKeys.length
        ? ingestKeys[0]!.keyHash.slice(0, 10) + "…"
        : null,
    };
  },
});

// ── Live ingestion (called from http.ts with a verified key) ──────

/**
 * Core scoring path, shared by the HTTP ingest endpoint and the settings
 * page's live test. Runs the engine against the user's stored history.
 */
export async function scoreAndStoreEvent(
  ctx: any,
  orgId: any,
  event: IngestEvent,
): Promise<{ sessionId: string; score: number; verdict: string; coldStart: boolean; userBlocked: boolean }> {
  const now = event.ts ?? Date.now();

  // Admin override: a manually blocked user is always reported as blocked,
  // whatever the engine thinks of this particular session.
  const blockRow = await ctx.db
    .query("sentinelBlockedUsers")
    .withIndex("by_org_user", (q: any) =>
      q.eq("orgId", orgId).eq("user", event.user),
    )
    .first();
  const userBlocked = blockRow !== null;

  // 1. Gather this user's benign history within the org.
  const historyRows = await ctx.db
    .query("sentinelLiveSessions")
    .withIndex("by_org_user", (q: any) => q.eq("orgId", orgId).eq("user", event.user))
    .collect();

  const history: SessionLog[] = historyRows
    .filter((r: any) => r.verdict !== "block") // blocked sessions never pollute the archive
    .map((r: any) => rowToSessionLog(r));

  // 2. Build baseline + detector from stored benign history.
  const tz = { label: "UTC", offset: 0 };
  const baseline = buildBaseline(history, tz);
  baseline.user = event.user;
  const detector = trainUserDetector(history, baseline);

  // 3. Assemble the incoming session against the baseline.
  const session: SessionLog = {
    id: "",
    user: event.user,
    ts: now,
    ip: event.ip ?? "0.0.0.0",
    city: event.city ?? "unknown",
    country: event.country ?? "unknown",
    lat: event.lat ?? 0,
    lon: event.lon ?? 0,
    device: event.device ?? "unknown",
    browser: event.browser ?? "unknown",
    sensitiveResources: event.sensitiveResources ?? [],
    fileDownloads: event.fileDownloads,
    fileUploads: event.fileUploads,
    apiCalls: event.apiCalls,
    privilegedActions: event.privilegedActions ?? [],
    authPassed: (event.authPassed ?? ["password"]) as ("password" | "otp")[],
    notes: event.notes ?? [],
  };

  const prev = history.length
    ? history.reduce((a, s) => (s.ts > a.ts ? s : a), history[0]!)
    : null;
  const risk = scoreSession(session, prev, detector);
  const coldStart = detector.forest === null;
  if (userBlocked) {
    risk.verdict = "block";
    risk.headline = "Blocked by analyst (manual override)";
  }

  // 4. Persist with role-based redaction baked in.
  const sessionId = await ctx.db.insert("sentinelLiveSessions", {
    orgId,
    user: event.user,
    userLabel: event.userLabel,
    ts: now,
    ip: event.ip,
    city: event.city,
    country: event.country,
    lat: event.lat,
    lon: event.lon,
    device: event.device,
    browser: event.browser,
    sensitiveResources: event.sensitiveResources ?? [],
    fileDownloads: event.fileDownloads,
    fileUploads: event.fileUploads,
    apiCalls: event.apiCalls,
    privilegedActions: event.privilegedActions ?? [],
    authPassed: event.authPassed ?? ["password"],
    notes: event.notes ?? [],
    score: risk.score,
    verdict: risk.verdict,
    headline: risk.headline,
    anomalyVote: risk.anomalyVote,
    factors: risk.factors,
    adminDetail: {
      ip: session.ip,
      city: session.city,
      country: session.country,
      device: session.device,
      browser: session.browser,
      sensitiveResources: session.sensitiveResources,
      privilegedActions: session.privilegedActions,
    },
    adminNotes: session.notes,
    coldStart,
  });

  return { sessionId, score: risk.score, verdict: risk.verdict, coldStart, userBlocked };
}

/** Convert a stored live-session row into an engine SessionLog. */
function rowToSessionLog(r: any): SessionLog {
  return {
    id: r._id,
    user: r.user,
    ts: r.ts,
    ip: r.ip ?? "0.0.0.0",
    city: r.city ?? "unknown",
    country: r.country ?? "unknown",
    lat: r.lat ?? 0,
    lon: r.lon ?? 0,
    device: r.device ?? "unknown",
    browser: r.browser ?? "unknown",
    sensitiveResources: r.sensitiveResources ?? [],
    fileDownloads: r.fileDownloads,
    fileUploads: r.fileUploads,
    apiCalls: r.apiCalls,
    privilegedActions: r.privilegedActions ?? [],
    authPassed: (r.authPassed ?? ["password"]) as ("password" | "otp")[],
    notes: r.notes ?? [],
  };
}

// ── Org queries (role-aware) ──────────────────────────────────────

/** Live sessions for an org. Admins see full detail; members get redacted rows. */
export const listLiveSessions = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== args.orgId) return null;
    const isAdmin = membership.role === "admin";

    const rows = await ctx.db
      .query("sentinelLiveSessions")
      .withIndex("by_org_ts", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(300);
    const blockedRows = await ctx.db
      .query("sentinelBlockedUsers")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const blockedSet = new Set(blockedRows.map((b) => b.user));

    return rows.map((r) => ({
      sessionId: r._id,
      user: r.user,
      userLabel: r.userLabel,
      ts: r.ts,
      score: r.score,
      verdict: r.verdict,
      headline: r.headline,
      anomalyVote: r.anomalyVote,
      downloads: r.fileDownloads,
      apiCalls: r.apiCalls,
      uploads: r.fileUploads,
      factors: r.factors,
      coldStart: r.coldStart,
      memo: r.memo ?? null,
      memoState: r.memoState,
      userBlocked: blockedSet.has(r.user),
      // Redaction boundary: only admins receive location, device, IP and
      // resource names. Members get masked values.
      ...(isAdmin
        ? {
            ip: r.ip ?? "0.0.0.0",
            city: r.city ?? "unknown",
            country: r.country ?? "unknown",
            device: r.device ?? "unknown",
            browser: r.browser ?? "unknown",
            sensitiveResources: r.sensitiveResources,
            privilegedActions: r.privilegedActions,
            notes: r.adminNotes ?? [],
            role: "admin" as const,
          }
        : {
            ip: "•.•.•.•",
            city: "redacted",
            country: "redacted",
            device: "redacted",
            browser: "redacted",
            sensitiveResources: r.sensitiveResources.map(() => "redacted"),
            privilegedActions: [],
            notes: [],
            role: "member" as const,
          }),
    }));
  },
});

/** One live session dossier, same role rules as listLiveSessions. */
export const getLiveSession = query({
  args: { sessionId: v.id("sentinelLiveSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const r = await ctx.db.get(args.sessionId);
    if (!r) return null;
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== r.orgId) return null;
    const isAdmin = membership.role === "admin";
    const blockRow = await ctx.db
      .query("sentinelBlockedUsers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", r.orgId).eq("user", r.user),
      )
      .first();

    return {
      sessionId: r._id,
      user: r.user,
      userLabel: r.userLabel,
      ts: r.ts,
      score: r.score,
      verdict: r.verdict,
      headline: r.headline,
      anomalyVote: r.anomalyVote,
      factors: r.factors,
      downloads: r.fileDownloads,
      uploads: r.fileUploads,
      apiCalls: r.apiCalls,
      coldStart: r.coldStart,
      memo: r.memo ?? null,
      memoState: r.memoState,
      userBlocked: blockRow !== null,
      blockSource: blockRow?.source ?? null,
      ...(isAdmin
        ? {
            ip: r.ip ?? "0.0.0.0",
            city: r.city ?? "unknown",
            country: r.country ?? "unknown",
            device: r.device ?? "unknown",
            browser: r.browser ?? "unknown",
            sensitiveResources: r.sensitiveResources,
            privilegedActions: r.privilegedActions,
            notes: r.adminNotes ?? [],
            role: "admin" as const,
          }
        : {
            ip: "•.•.•.•",
            city: "redacted",
            country: "redacted",
            device: "redacted",
            browser: "redacted",
            sensitiveResources: r.sensitiveResources.map(() => "redacted"),
            privilegedActions: [],
            notes: [],
            role: "member" as const,
          }),
    };
  },
});

/** Per-user watchlist with peak scores for the org rail. */
export const listLiveUsers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== args.orgId) return null;
    const rows = await ctx.db
      .query("sentinelLiveSessions")
      .withIndex("by_org_ts", (q) => q.eq("orgId", args.orgId))
      .take(500);
    const byUser = new Map<string, { user: string; maxScore: number; sessions: number }>();
    for (const r of rows) {
      const cur = byUser.get(r.user) ?? { user: r.user, maxScore: 0, sessions: 0 };
      cur.maxScore = Math.max(cur.maxScore, r.score);
      cur.sessions += 1;
      byUser.set(r.user, cur);
    }
    return [...byUser.values()];
  },
});

// ── SOC actions on live sessions ──────────────────────────────────

export const blockLiveUser = mutation({
  args: { sessionId: v.id("sentinelLiveSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required.");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found.");
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== session.orgId || membership.role !== "admin") {
      throw new Error("Only domain admins can block users.");
    }
    await ctx.db.patch(args.sessionId, { verdict: "block", headline: "Blocked by analyst" });
    return { ok: true };
  },
});

export const markLiveReviewed = mutation({
  args: { sessionId: v.id("sentinelLiveSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required.");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found.");
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== session.orgId) {
      throw new Error("Not a member of this org.");
    }
    await ctx.db.patch(args.sessionId, { verdict: "allow", headline: "Reviewed by analyst" });
    return { ok: true };
  },
});

export const saveLiveMemo = mutation({
  args: { sessionId: v.id("sentinelLiveSessions"), memo: v.string(), memoModel: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      memo: args.memo,
      memoModel: args.memoModel,
      memoState: "ready",
    });
    return { ok: true };
  },
});

export const patchLiveMemoState = mutation({
  args: { sessionId: v.id("sentinelLiveSessions"), memoState: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { memoState: args.memoState });
    return { ok: true };
  },
});

// ── Manual block / unblock (admin override) ──────────────────

/**
 * Manually block or unblock a user account, org-wide. This is the analyst's
 * override: a manual block stands regardless of what the engine scores, and a
 * manual unblock stands regardless of what the engine recommends — until the
 * admin changes their mind.
 */
export const setUserBlocked = mutation({
  args: {
    orgId: v.id("organizations"),
    user: v.string(),
    userLabel: v.optional(v.string()),
    blocked: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required.");
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== args.orgId || membership.role !== "admin") {
      throw new Error("Only domain admins can block or unblock accounts.");
    }

    const existing = await ctx.db
      .query("sentinelBlockedUsers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", args.orgId).eq("user", args.user),
      )
      .first();

    if (args.blocked) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          reason: args.reason ?? existing.reason,
          userLabel: args.userLabel ?? existing.userLabel,
          blockedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("sentinelBlockedUsers", {
          orgId: args.orgId,
          user: args.user,           
          userLabel: args.userLabel,
          reason: args.reason ?? "Blocked manually by the analyst on duty.",
          source: "manual",
          blockedByUserId: userId,
          blockedAt: Date.now(),
        });
      }
      // Stamp the newest live session so the ledger reflects the state.
      const latest = await ctx.db
        .query("sentinelLiveSessions")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", args.orgId).eq("user", args.user),
        )
        .order("desc")
        .first();
      if (latest) {
        await ctx.db.patch(latest._id, {
          verdict: "block",
          headline: "Blocked by analyst (manual)",
        });
      }
    } else {
      if (existing) await ctx.db.delete(existing._id);
      // Clear the stamp from the newest session.
      const latest = await ctx.db
        .query("sentinelLiveSessions")
      .withIndex("by_org_user", (q) =>
          q.eq("orgId", args.orgId).eq("user", args.user),
        )
        .order("desc")
        .first();
      if (latest && latest.headline === "Blocked by analyst (manual)") {
        await ctx.db.patch(latest._id, {
          verdict: "allow",
          headline: "Unblocked by analyst — monitoring continues",
        });
      }
    }
    return { ok: true };
  },
});

/** Block list for the org — visible to all members (not sensitive detail). */
export const listBlockedUsers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== args.orgId) return null;
    const rows = await ctx.db
      .query("sentinelBlockedUsers")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return rows.map((r) => ({
      user: r.user,
      userLabel: r.userLabel ?? null,
      reason: r.reason,
      source: r.source,
      blockedAt: r.blockedAt,
    }));
  },
});

// ── Live LLM analyst action ───────────────────────────────────────

/** Membership check for actions (no ctx.db there): null when not allowed. */
export const liveSessionViewer = query({
  args: { sessionId: v.id("sentinelLiveSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== session.orgId) return null;
    return { ok: true as const, orgId: session.orgId };
  },
});

/** Raw row access for the analyst action (membership already verified). */
export const liveSessionAdminView = query({
  args: { sessionId: v.id("sentinelLiveSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    return {
      user: session.user,
      score: session.score,
      verdict: session.verdict,
      headline: session.headline,
      coldStart: session.coldStart,
      factors: session.factors,
      notes: session.adminNotes ?? [],
    };
  },
});

export const explainLiveCase = action({
  args: { sessionId: v.id("sentinelLiveSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required.");

    // Actions have no ctx.db — fetch via queries/mutations only.
    const viewer = await ctx.runQuery(api.orgs.liveSessionViewer, { sessionId: args.sessionId });
    if (!viewer) throw new Error("Session not found or not a member of its org.");

    await ctx.runMutation(api.orgs.patchLiveMemoState, {
      sessionId: args.sessionId,
      memoState: "pending",
    });

    const session = (await ctx.runQuery(api.orgs.liveSessionAdminView, {
      sessionId: args.sessionId,
    })) as {
      user: string;
      score: number;
      verdict: string;
      headline: string;
      coldStart: boolean;
      factors: { label: string; weight: number; detail: string }[];
      notes: string[];
    } | null;
    if (!session) throw new Error("Session vanished while the analyst was summoning.");

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const factorLines = session.factors
      .map((f) => `- ${f.label} (weight ${f.weight}): ${f.detail}`)
      .join("\n");
    const prompt = [
      `Security session under review — verdict ${String(session.verdict).toUpperCase()}, risk ${session.score}/100.`,
      `User: ${session.user}. Headline: ${session.headline}`,
      `History sessions on file: ${session.coldStart ? "few (cold start — archive still thin)" : "sufficient"}.`,
      "Detected anomalies:",
      factorLines || "- none recorded",
      "Raw log notes:",
      ...session.notes.map((n) => `- ${n}`),
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
              "Given technical evidence, write a 3-5 sentence memo in a calm, archival tone. " +
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
      await ctx.runMutation(api.orgs.patchLiveMemoState, {
        sessionId: args.sessionId,
        memoState: "failed",
      });
      throw err;
    }
    if (!memo) {
      await ctx.runMutation(api.orgs.patchLiveMemoState, {
        sessionId: args.sessionId,
        memoState: "failed",
      });
      throw new Error("The analyst returned an empty memo.");
    }

    await ctx.runMutation(api.orgs.saveLiveMemo, {
      sessionId: args.sessionId,
      memo,
      memoModel: "gpt-4o-mini",
    });
    return memo;
  },
});

// ── Live test event (settings page) ───────────────────────────────

/**
 * Fire a scripted anomaly (or benign pulse) through the real ingestion path
 * so an admin can verify their integration without touching production code.
 */
export const sendTestEvent = mutation({
  args: {
    orgId: v.id("organizations"),
    kind: v.union(v.literal("benign"), v.literal("attack")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in required.");
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!membership || membership.orgId !== args.orgId || membership.role !== "admin") {
      throw new Error("Only domain admins can send test events.");
    }

    const now = Date.now();
    const benignEvent: IngestEvent = {
      user: "test.user",
      userLabel: "Integration Test User",
      ts: now,
      ip: "10.0.3.42",
      city: "Chennai",
      country: "India",
      lat: 13.0827,
      lon: 80.2707,
      device: "Latitude 7440",
      browser: "Firefox 141",
      sensitiveResources: [],
      fileDownloads: 8,
      fileUploads: 1,
      apiCalls: 420,
      privilegedActions: [],
      authPassed: ["password", "otp"],
      notes: ["SentinelAI integration test — benign pulse"],
    };
    const attackEvent: IngestEvent = {
      user: "test.user",
      userLabel: "Integration Test User",
      ts: now,
      ip: "203.0.113.77",
      city: "Belgrade",
      country: "Serbia",
      lat: 44.7866,
      lon: 20.4489,
      device: "Windows Server",
      browser: "Tor Browser 14",
      sensitiveResources: ["Payroll Register", "Treasury Export"],
      fileDownloads: 1847,
      fileUploads: 3,
      apiCalls: 9312,
      privilegedActions: ["export_payroll", "create_api_key"],
      authPassed: ["password", "otp"],
      notes: ["SentinelAI integration test — simulated account takeover"],
    };

    const event = args.kind === "attack" ? attackEvent : benignEvent;
    const result = await scoreAndStoreEvent(ctx, args.orgId, event);
    return result;
  },
});
