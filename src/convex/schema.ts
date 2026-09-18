import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    // ── Multi-tenant organizations ────────────────────────────────
    // One org per registered domain. Created by claiming the domain with a
    // matching work email; joinable by other members of the same email domain.
    organizations: defineTable({
      name: v.string(),
      domain: v.string(), // lowercase registrable domain, e.g. acme.com
      createdAt: v.number(),
      createdByUserId: v.id("users"),
    })
      .index("by_domain", ["domain"])
      .index("by_creator", ["createdByUserId"]),

    // Membership links a signed-in user to an org with a role.
    orgMembers: defineTable({
      orgId: v.id("organizations"),
      userId: v.id("users"),
      email: v.string(),
      role: v.union(v.literal("admin"), v.literal("member")),
      createdAt: v.number(),
    })
      .index("by_org", ["orgId"])
      .index("by_user", ["userId"]),

    // Per-key ingest credentials. One row per issued key so the HTTP
    // endpoint can look an org up by key hash with an index.
    ingestKeys: defineTable({
      orgId: v.id("organizations"),
      keyHash: v.string(), // sha256 hex of `sai_…` — raw keys are never stored
      createdAt: v.number(),
      createdByUserId: v.id("users"),
      revoked: v.boolean(),
    })
      .index("by_hash", ["keyHash"])
      .index("by_org", ["orgId"]),

    // Live ingested sessions, scored at write time by the engine.
    sentinelLiveSessions: defineTable({
      orgId: v.id("organizations"),
      /** Ingestion-side user id from the customer's system (stable per user). */
      user: v.string(),
      userLabel: v.optional(v.string()),
      ts: v.number(),
      ip: v.optional(v.string()),
      city: v.optional(v.string()),
      country: v.optional(v.string()),
      lat: v.optional(v.number()),
      lon: v.optional(v.number()),
      device: v.optional(v.string()),
      browser: v.optional(v.string()),
      sensitiveResources: v.array(v.string()),
      fileDownloads: v.number(),
      fileUploads: v.number(),
      apiCalls: v.number(),
      privilegedActions: v.array(v.string()),
      authPassed: v.array(v.string()),
      notes: v.array(v.string()),
      score: v.number(),
      verdict: v.string(),
      headline: v.string(),
      anomalyVote: v.number(),
      factors: v.array(
        v.object({
          code: v.string(),
          label: v.string(),
          weight: v.number(),
          detail: v.string(),
        }),
      ),
      /** Admin-only: full IP + resource names. Null for member rows. */
      adminDetail: v.optional(
        v.object({
          ip: v.string(),
          city: v.string(),
          country: v.string(),
          device: v.string(),
          browser: v.string(),
          sensitiveResources: v.array(v.string()),
          privilegedActions: v.array(v.string()),
        }),
      ),
      /** Admin-only: raw log notes. */
      adminNotes: v.optional(v.array(v.string())),
      coldStart: v.boolean(),
      memo: v.optional(v.string()),
      memoModel: v.optional(v.string()),
      memoState: v.optional(
        v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
      ),
    })
      .index("by_org_ts", ["orgId", "ts"])
      .index("by_org_user", ["orgId", "user"]),

    // Persisted SOC case files so verdicts, analyst memos and block actions
    // survive reloads during the demo.
    sentinelCases: defineTable({
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
      memo: v.optional(v.string()),
      memoModel: v.optional(v.string()),
      memoState: v.optional(
        v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
      ),
      reviewed: v.boolean(),
      blocked: v.boolean(),
      /** Set for cases originating from a live tenant org. */
      orgId: v.optional(v.id("organizations")),
    }).index("by_session", ["sessionId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
