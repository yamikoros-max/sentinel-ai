import type { Baseline, SessionLog } from "./types";
import { haversineKm, impliedSpeedKmh } from "./geo";

/** Home-timezone descriptor used to evaluate login hours in the user's own clock. */
export interface TzInfo {
  label: string;
  offset: number;
}

/**
 * Build one user's baseline from their benign history alone. Used by both the
 * demo archive and the live multi-tenant ingestion path. Safe on empty
 * history — returns an "unknown" archive that suppresses hour evidence.
 */
export function buildBaseline(history: SessionLog[], tz: TzInfo): Baseline {
  const sorted = [...history].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) {
    return {
      user: "",
      homeCity: "unknown",
      homeCountry: "unknown",
      lat: 0,
      lon: 0,
      homeTzLabel: tz.label,
      homeTzOffset: tz.offset,
      loginHourStart: 0,
      loginHourEnd: 24,
      devices: [],
      ips: [],
      downloadsMin: 0,
      downloadsMax: 0,
      apiCallsMin: 0,
      apiCallsMax: 0,
      familiarResources: [],
      familiarActions: [],
      sessionsScored: 0,
      lastActiveTs: 0,
    };
  }
  const localHours = sorted.map((s) => {
    const d = new Date(s.ts);
    return d.getUTCHours() + d.getUTCMinutes() / 60 + tz.offset;
  });
  const devices = [...new Set(sorted.map((s) => `${s.device} — ${s.browser}`))];
  const ips = [...new Set(sorted.map((s) => s.ip))];
  const resources = [...new Set(sorted.flatMap((s) => s.sensitiveResources))];
  const actions = [...new Set(sorted.flatMap((s) => s.privilegedActions))];
  const home = sorted[0]!;
  return {
    user: sorted[0]!.user,
    homeCity: home.city,
    homeCountry: home.country,
    lat: home.lat,
    lon: home.lon,
    homeTzLabel: tz.label,
    homeTzOffset: tz.offset,
    loginHourStart: Math.min(...localHours),
    loginHourEnd: Math.max(...localHours),
    devices,
    ips,
    downloadsMin: Math.min(...sorted.map((s) => s.fileDownloads)),
    downloadsMax: Math.max(...sorted.map((s) => s.fileDownloads)),
    apiCallsMin: Math.min(...sorted.map((s) => s.apiCalls)),
    apiCallsMax: Math.max(...sorted.map((s) => s.apiCalls)),
    familiarResources: resources,
    familiarActions: actions,
    sessionsScored: sorted.length,
    lastActiveTs: sorted[sorted.length - 1]!.ts,
  };
}

/**
 * Baseline = the "case archive" for one user: everything SentinelAI has on
 * file about their normal behavior. Built from benign history only —
 * attack-story sessions never pollute the archive.
 */
export function buildBaselines(sessions: SessionLog[]): Map<string, Baseline> {
  const benign = sessions.filter((s) => !s.attackStory);
  const byUser = new Map<string, SessionLog[]>();
  for (const s of benign) {
    const list = byUser.get(s.user) ?? [];
    list.push(s);
    byUser.set(s.user, list);
  }

  const baselines = new Map<string, Baseline>();
  for (const [user, list] of byUser) {
    const baseline = buildBaseline(list, {
      label: TZ_LABELS.get(user) ?? "UTC",
      offset: TZ_OFFSETS.get(user) ?? 0,
    });
    baseline.user = user;
    baselines.set(user, baseline);
  }
  return baselines;
}

/** Fallback archive for a user we have never seen. */
export function baselineFor(
  baselines: Map<string, Baseline>,
  user: string,
): Baseline {
  return (
    baselines.get(user) ?? {
      user,
      homeCity: "unknown",
      homeCountry: "unknown",
      lat: 0,
      lon: 0,
      homeTzLabel: "UTC",
      homeTzOffset: 0,
      loginHourStart: 9,
      loginHourEnd: 19,
      devices: [],
      ips: [],
      downloadsMin: 0,
      downloadsMax: 0,
      apiCallsMin: 0,
      apiCallsMax: 0,
      familiarResources: [],
      familiarActions: [],
      sessionsScored: 0,
      lastActiveTs: 0,
    }
  );
}

// Home-timezone metadata per persona (populated from sample personas).
export const TZ_LABELS = new Map<string, string>([
  ["Priya Sharma", "IST"],
  ["Marcus Chen", "SGT"],
  ["Amara Okafor", "WAT"],
]);
export const TZ_OFFSETS = new Map<string, number>([
  ["Priya Sharma", 5.5],
  ["Marcus Chen", 8],
  ["Amara Okafor", 1],
]);

/**
 * The most recent benign session for the SAME user before `ts` —
 * used to compute impossible-travel speed between consecutive logins.
 */
export function previousSessionBefore(
  sessions: SessionLog[],
  user: string,
  ts: number,
): SessionLog | null {
  let best: SessionLog | null = null;
  for (const s of sessions) {
    if (s.attackStory || s.user !== user || s.ts >= ts) continue;
    if (best === null || s.ts > best.ts) best = s;
  }
  return best;
}

export { haversineKm, impliedSpeedKmh };
