import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/** SHA-256 hex of the presented ingest key — the stored form. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const jsonHeaders = { "Content-Type": "application/json" };

/** Light shape check before handing the event to the (fully validated) mutation. */
function looksLikeEvent(body: unknown): body is Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.user === "string" &&
    typeof b.fileDownloads === "number" &&
    typeof b.fileUploads === "number" &&
    typeof b.apiCalls === "number"
  );
}

/**
 * POST /api/ingest — the public, live session-event intake for customer domains.
 *
 * Auth: `Authorization: Bearer sai_<…>` (org ingest key).
 * Body: one JSON session event. The event is scored against that user's
 * behavioral archive and persisted; the verdict comes back so the caller
 * can act on it (allow / monitor / challenge / block) in real time.
 */
async function handleIngest(ctx: any, request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  // ── Auth ────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(sai_[0-9a-f]{64})$/i);
  if (!match) {
    return new Response(
      JSON.stringify({
        error: "Missing or malformed key. Use: Authorization: Bearer sai_…",
      }),
      { status: 401, headers: jsonHeaders },
    );
  }
  const keyHash = await sha256Hex(match[1]!);

  // ── Body ────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body must be valid JSON." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  if (!looksLikeEvent(body)) {
    return new Response(
      JSON.stringify({
        error:
          "Invalid event: requires user (string), fileDownloads, fileUploads, apiCalls (numbers).",
      }),
      { status: 422, headers: jsonHeaders },
    );
  }

  // ── Score + store (org lookup + write live in the mutation) ─────
  let result: any;
  try {
    result = await ctx.runMutation(api.orgs.ingestViaHash, {
      keyHash,
      event: body,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Event rejected.",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 422, headers: jsonHeaders },
    );
  }

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      sessionId: result.sessionId,
      score: result.score,
      verdict: result.verdict,
      action: result.verdict, // allow | monitor | challenge | block
      headline: result.headline,
      coldStart: result.coldStart,
    }),
    { status: 200, headers: jsonHeaders },
  );
}

const ingestHandler = httpAction(handleIngest);

http.route({ path: "/api/ingest", method: "POST", handler: ingestHandler });
http.route({ path: "/api/ingest", method: "OPTIONS", handler: ingestHandler });

export default http;
