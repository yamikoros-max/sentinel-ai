/**
 * Deterministic sample session archive for the demo.
 * Seeded PRNG ⇒ identical replay on every load. Benign history is generated
 * in each persona's home timezone; the attack story is a curated outlier.
 */
import { mulberry32, randInt, jitter } from "./prng";
import type { SessionLog } from "./types";

export interface Persona {
  name: string;
  homeCity: string;
  homeCountry: string;
  lat: number;
  lon: number;
  /** Home timezone offset from UTC, in hours. */
  tzOffset: number;
  tzLabel: string;
  device: string;
  browser: string;
  workStart: number;
  workEnd: number;
}

export const PERSONAS: Persona[] = [
  {
    name: "Priya Sharma",
    homeCity: "Chennai",
    homeCountry: "India",
    lat: 13.0827,
    lon: 80.2707,
    tzOffset: 5.5,
    tzLabel: "IST",
    device: "Latitude 7440",
    browser: "Firefox 141",
    workStart: 9,
    workEnd: 19,
  },
  {
    name: "Marcus Chen",
    homeCity: "Singapore",
    homeCountry: "Singapore",
    lat: 1.3521,
    lon: 103.8198,
    tzOffset: 8,
    tzLabel: "SGT",
    device: "MacBook Pro 16",
    browser: "Chrome 139",
    workStart: 8,
    workEnd: 18,
  },
  {
    name: "Amara Okafor",
    homeCity: "Lagos",
    homeCountry: "Nigeria",
    lat: 6.5244,
    lon: 3.3792,
    tzOffset: 1,
    tzLabel: "WAT",
    device: "ThinkPad X1",
    browser: "Edge 138",
    workStart: 8,
    workEnd: 17,
  },
];

/** Attack story: the "stolen session" moment, anchored to a fixed date. */
const ATTACK_TS = Date.UTC(2026, 8, 14, 21, 45, 0); // = 03:15 IST, Sep 15

/**
 * 21 days of benign history × 3 personas + the attack story.
 * Benign sessions land inside working hours, home city, usual device.
 * IPs are drawn from a small office pool so "unfamiliar network" stays quiet.
 */
export function generateSampleSessions(): SessionLog[] {
  const rnd = mulberry32(42);
  const sessions: SessionLog[] = [];

  PERSONAS.forEach((p, pi) => {
    const ipPool = [
      `10.${20 + pi}.3.${randInt(rnd, 10, 99)}`,
      `10.${20 + pi}.4.${randInt(rnd, 10, 99)}`,
    ];
    for (let day = 21; day >= 1; day--) {
      const base = new Date(Date.UTC(2026, 8, 15)); // Sep 15 2026 anchor
      base.setUTCDate(base.getUTCDate() - day);
      if (rnd() < 0.18) continue; // day off

      const hour = randInt(rnd, p.workStart, p.workEnd - 1);
      const minute = randInt(rnd, 0, 59);
      const utcHours = hour - p.tzOffset;
      const dayShift = utcHours < 0 ? 1 : 0;
      const ts = Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() + dayShift,
        Math.floor(utcHours),
        minute,
      );
      const ip = ipPool[randInt(rnd, 0, ipPool.length - 1)]!;

      sessions.push({
        id: `H${pi}-${day}-${minute}`,
        user: p.name,
        ts,
        ip,
        city: p.homeCity,
        country: p.homeCountry,
        lat: p.lat + jitter(rnd, 0.02),
        lon: p.lon + jitter(rnd, 0.02),
        device: p.device,
        browser: p.browser,
        sensitiveResources: rnd() < 0.3 ? ["Ledger — Accounts Receivable"] : [],
        fileDownloads: randInt(rnd, 3, 12),
        fileUploads: randInt(rnd, 0, 4),
        apiCalls: randInt(rnd, 300, 900),
        privilegedActions:
          rnd() < 0.35 ? ["export_report"] : rnd() < 0.2 ? ["view_payroll"] : [],
        authPassed: ["password", "otp"],
        notes: [
          `Login ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${p.tzLabel} — device fingerprint matched archive`,
          `Files: ${3 + randInt(rnd, 0, 9)} downloads, ${randInt(rnd, 0, 4)} uploads`,
          `API: ${300 + randInt(rnd, 0, 600)} calls across ${randInt(rnd, 8, 22)} endpoints`,
        ],
      });
    }
  });

  // ── Attack story: Priya's account, 03:15 IST from Belgrade over Tor ──
  sessions.push({
    id: "ATTACK-01",
    user: "Priya Sharma",
    ts: ATTACK_TS,
    ip: "203.0.113.77",
    city: "Belgrade",
    country: "Serbia",
    lat: 44.7866,
    lon: 20.4489,
    device: "Windows Server",
    browser: "Tor Browser 14",
    sensitiveResources: ["Payroll Register — September", "Treasury Export"],
    fileDownloads: 1847,
    fileUploads: 3,
    apiCalls: 9312,
    privilegedActions: ["export_payroll", "create_api_key", "disable_alerts"],
    authPassed: ["password", "otp"],
    notes: [
      "Login 03:15 IST — password correct, OTP correct (SIM-swap suspected)",
      "Device fingerprint unseen in archive",
      "1,847 file downloads within 22 minutes",
      "Payroll register opened for the first time on record",
      "Two new API keys created; alert routing disabled",
    ],
    attackStory: true,
  });

  return sessions;
}

/** Convenience: all sessions sorted chronologically. */
export function sessionsChronological(): SessionLog[] {
  return [...generateSampleSessions()].sort((a, b) => a.ts - b.ts);
}
