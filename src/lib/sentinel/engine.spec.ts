/**
 * Targeted engine tests — run with: bun run src/lib/sentinel/engine.spec.ts
 *
 * Covers the scoring APIs the multi-tenant work refactored:
 *   - trainUserDetector / scoreSession (per-user one-class scoring)
 *   - the cold-start guard (thin archives are capped at "monitor")
 *   - the demo-archive calibration gates (benign < 30, attack ≥ 80)
 */
import { generateSampleSessions } from "./samples";
import { buildBaseline, previousSessionBefore } from "./baselines";
import {
  MIN_HISTORY_FOR_ENSEMBLE,
  scoreAllSessions,
  scoreSession,
  trainUserDetector,
  type UserDetector,
} from "./engine";
import type { SessionLog } from "./types";

// ── Tiny assertion harness (no framework in this project) ───────────────────

let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const TZ = { label: "IST", offset: 5.5 };
const USER = "Test Analyst";

function benignSession(day: number, utcHour: number): SessionLog {
  // local time = UTC + 5.5 ⇒ 10:30–17:30 IST, inside working hours
  return {
    id: `T-${day}-${utcHour}`,
    user: USER,
    ts: Date.UTC(2026, 8, day, utcHour, 30),
    ip: "10.20.3.42",
    city: "Chennai",
    country: "India",
    lat: 13.0827,
    lon: 80.2707,
    device: "Latitude 7440",
    browser: "Firefox 141",
    sensitiveResources: [],
    fileDownloads: 6,
    fileUploads: 1,
    apiCalls: 500,
    privilegedActions: [],
    authPassed: ["password", "otp"],
    notes: [],
  };
}

/** 11 days of history + one session 9¼ h before the attack (for travel evidence). */
function warmHistory(): SessionLog[] {
  const hist: SessionLog[] = [];
  for (let day = 1; day <= 11; day++) hist.push(benignSession(day, 5 + (day % 7)));
  hist.push(benignSession(14, 12)); // Sep 14, 17:30 IST
  return hist;
}

const ATTACK: SessionLog = {
  id: "T-ATTACK",
  user: USER,
  ts: Date.UTC(2026, 8, 14, 21, 45), // 03:15 IST
  ip: "203.0.113.99",
  city: "Belgrade",
  country: "Serbia",
  lat: 44.7866,
  lon: 20.4489,
  device: "Windows Server",
  browser: "Tor Browser 14",
  sensitiveResources: ["Payroll Register — September"],
  fileDownloads: 1847,
  fileUploads: 3,
  apiCalls: 9312,
  privilegedActions: ["export_payroll", "create_api_key"],
  authPassed: ["password", "otp"],
  notes: [],
};

function detectorFor(history: SessionLog[]): UserDetector {
  return trainUserDetector(history, buildBaseline(history, TZ));
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("── engine.spec: scoring APIs ──");

test("MIN_HISTORY_FOR_ENSEMBLE is 5", () => {
  assertEq(MIN_HISTORY_FOR_ENSEMBLE, 5, "cold-start threshold changed");
});

test("thin archive keeps the forest disabled (cold start)", () => {
  assertEq(detectorFor(warmHistory().slice(0, 3)).forest, null, "forest should be null below 5 sessions");
  assert(detectorFor(warmHistory().slice(0, 5)).forest !== null, "forest should fit at exactly 5 sessions");
});

test("cold path is evidence-only and never blocks", () => {
  const cold = detectorFor(warmHistory().slice(0, 3));
  const r = scoreSession(ATTACK, previousSessionBefore(warmHistory().slice(0, 3), USER, ATTACK.ts), cold);
  assert(r.verdict !== "block", `cold path must never auto-block, got ${r.verdict}`);
  assert(r.score <= 59, `cold path score must stay ≤59 (monitor ceiling), got ${r.score}`);
  assertEq(r.verdict, "monitor", "a full-evidence cold session lands at monitor");
});

test("warm path: benign session scores < 30 (allow)", () => {
  const warm = detectorFor(warmHistory());
  const benign: SessionLog = { ...benignSession(15, 9), id: "T-BENIGN-CHECK" }; // Sep 15, 14:30 IST
  const r = scoreSession(benign, previousSessionBefore(warmHistory(), USER, benign.ts), warm);
  assert(r.score < 30, `benign session should score <30, got ${r.score}`);
  assertEq(r.verdict, "allow", "benign session verdict");
});

test("warm path: attack session scores ≥ 80 (block) with full factor ledger", () => {
  const warm = detectorFor(warmHistory());
  const r = scoreSession(ATTACK, previousSessionBefore(warmHistory(), USER, ATTACK.ts), warm);
  assert(r.score >= 80, `attack session should score ≥80, got ${r.score}`);
  assertEq(r.verdict, "block", "attack session verdict");
  const codes = new Set(r.factors.map((f) => f.code));
  for (const expected of [
    "UNUSUAL_HOUR",
    "NEW_DEVICE",
    "NEW_IP",
    "IMPOSSIBLE_TRAVEL",
    "DOWNLOAD_SPIKE",
    "API_BURST",
    "NEW_RESOURCE",
    "NEW_ACTION",
  ]) {
    assert(codes.has(expected), `missing rule factor ${expected}`);
  }
});

test("baseline for empty history suppresses hour evidence", () => {
  const b = buildBaseline([], TZ);
  assertEq(b.homeCity, "unknown", "empty archive city");
  assert(b.loginHourStart === 0 && b.loginHourEnd === 24, "empty archive must open the full day");
});

test("previousSessionBefore picks the latest prior benign session for the same user", () => {
  const hist = warmHistory();
  const prev = previousSessionBefore(hist, USER, ATTACK.ts);
  assert(prev !== null, "expected a prior session");
  assertEq(prev!.id, "T-14-12", "latest prior benign session id");
  assertEq(previousSessionBefore(hist, "Nobody Else", ATTACK.ts), null, "other users are ignored");
});

console.log("── engine.spec: archive calibration gates ──");

test("sample archive: benign < 30 (all allow), attack ≥ 80 (block)", () => {
  const results = scoreAllSessions(generateSampleSessions());
  const benign = results.filter((r) => !r.session.attackStory);
  const attack = results.filter((r) => r.session.attackStory);
  const maxBenign = Math.max(...benign.map((r) => r.score));
  assert(maxBenign < 30, `max benign score ${maxBenign} must stay <30`);
  assert(benign.every((r) => r.verdict === "allow"), "every benign session must be 'allow'");
  assertEq(attack.length, 1, "exactly one attack-story session");
  assert(attack[0]!.score >= 80, `attack score ${attack[0]!.score} must be ≥80`);
  assertEq(attack[0]!.verdict, "block", "attack verdict");
});

console.log("");
if (failed > 0) {
  console.log(`✗ ${failed} test(s) failed`);
  process.exitCode = 1;
} else {
  console.log("✓ All engine tests passed");
}
