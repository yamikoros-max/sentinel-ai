/**
 * SentinelAI Risk Engine.
 *
 * Pipeline: SessionLog → feature vector → Isolation Forest + rule evidence
 * → calibrated 0–100 risk score → factor ledger → verdict dispatch.
 */
import { IsolationForest } from "./isoforest";
import { haversineKm, impliedSpeedKmh } from "./geo";
import { baselineFor, buildBaselines, previousSessionBefore } from "./baselines";
import type {
  Baseline,
  RiskFactor,
  SessionLog,
  SessionRisk,
  Verdict,
} from "./types";

/** The behavioral features fed to the detector, in fixed order. */
export const FEATURE_NAMES = [
  "hourSin",
  "hourCos",
  "dayOfWeek",
  "deviceNew",
  "ipNew",
  "geoDistKm",
  "downloadRatio",
  "apiRatio",
  "resourceNew",
  "actionNew",
  "travelSpeed",
] as const;

function localHour(ts: number, tzOffsetHours: number): number {
  const d = new Date(ts);
  return (d.getUTCHours() + d.getUTCMinutes() / 60 + tzOffsetHours + 24) % 24;
}

function hourAngle(ts: number, tzOffsetHours: number): number {
  return (localHour(ts, tzOffsetHours) / 24) * 2 * Math.PI;
}

/** Build the numeric behavior vector for one session against its baseline. */
export function extractFeatures(
  s: SessionLog,
  b: Baseline,
  prev: SessionLog | null,
): number[] {
  const angle = hourAngle(s.ts, b.homeTzOffset);
  const dow = new Date(s.ts).getUTCDay() / 7;
  const deviceNew = b.devices.includes(`${s.device} — ${s.browser}`) ? 0 : 1;
  const ipNew = b.ips.includes(s.ip) ? 0 : 1;
  const geoDistKm = haversineKm(b.lat, b.lon, s.lat, s.lon);
  const downloadRatio =
    b.downloadsMax > 0 ? s.fileDownloads / b.downloadsMax : s.fileDownloads > 0 ? 2 : 0;
  const apiRatio =
    b.apiCallsMax > 0 ? s.apiCalls / b.apiCallsMax : s.apiCalls > 0 ? 2 : 0;
  const resourceNew = s.sensitiveResources.some(
    (r) => !b.familiarResources.includes(r),
  )
    ? 1
    : 0;
  const actionNew = s.privilegedActions.some(
    (a) => !b.familiarActions.includes(a),
  )
    ? 1
    : 0;
  const travelSpeed = prev
    ? Math.min(
        impliedSpeedKmh(prev.lat, prev.lon, prev.ts, s.lat, s.lon, s.ts),
        10000,
      )
    : 0;

  return [
    Math.sin(angle),
    Math.cos(angle),
    dow,
    deviceNew,
    ipNew,
    Math.min(geoDistKm, 20000) / 20000,
    Math.min(downloadRatio, 10) / 10,
    Math.min(apiRatio, 10) / 10,
    resourceNew,
    actionNew,
    Math.min(travelSpeed, 10000) / 10000,
  ];
}

/** Calibrate relative anomaly (0–1+) + rule evidence (0–1) into 0–100. */
function calibrate(anomalyRel: number, evidenceWeight: number): number {
  const blended = 0.25 * anomalyRel + 0.75 * evidenceWeight;
  return Math.round(Math.min(100, Math.max(0, blended * 100)));
}
function verdictFor(score: number): Verdict {
  if (score < 30) return "allow";
  if (score < 60) return "monitor";
  if (score < 80) return "challenge";
  return "block";
}

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "allow":
      return "Allow";
    case "monitor":
      return "Monitor";
    case "challenge":
      return "Challenge MFA";
    case "block":
      return "Block + Alert";
  }
}

/** Risk band metadata for UI stamps. */
export function bandFor(score: number): {
  label: string;
  tone: "calm" | "watch" | "warn" | "alarm";
} {
  if (score < 30) return { label: "Benign", tone: "calm" };
  if (score < 60) return { label: "Watch", tone: "watch" };
  if (score < 80) return { label: "Suspicious", tone: "warn" };
  return { label: "Critical", tone: "alarm" };
}

/**
 * Everything the scorer needs for one user: their fitted one-class forest
 * (or null while the archive is still too thin), their baseline, and the
 * benign history the forest was trained on.
 */
export interface UserDetector {
  forest: IsolationForest | null;
  maxBenignAnomaly: number;
  baseline: Baseline;
  history: SessionLog[];
}

/**
 * Minimum benign sessions before the Isolation Forest is trusted for a user.
 * Below this, scoring is evidence-only and capped at "monitor" — a brand-new
 * account can look odd without being throttled or blocked by the system.
 */
export const MIN_HISTORY_FOR_ENSEMBLE = 5;

/** Fit one user's forest on their benign manifold (no-op below the threshold). */
export function trainUserDetector(
  history: SessionLog[],
  baseline: Baseline,
): UserDetector {
  if (history.length < MIN_HISTORY_FOR_ENSEMBLE) {
    return { forest: null, maxBenignAnomaly: 1, baseline, history };
  }
  const X = history.map((s) => extractFeatures(s, baseline, null));
  const forest = new IsolationForest({ nTrees: 60, sampleSize: 64, seed: 11 }).fit(X);
  const maxBenignAnomaly = Math.max(...X.map((x) => forest.score(x)), 0.01);
  return { forest, maxBenignAnomaly, baseline, history };
}

/**
 * Score one session against its user's detector.
 * Warm path: relative forest anomaly blended with rule evidence (0–100).
 * Cold path: evidence-only, capped at 59 so new users are never auto-blocked.
 */
export function scoreSession(
  s: SessionLog,
  prev: SessionLog | null,
  detector: UserDetector,
): SessionRisk {
  const b = detector.baseline;
  const x = extractFeatures(s, b, prev);
  const factors = attributeFactors(s, b, prev);
  const evidence = Math.min(1, factors.reduce((a, f) => a + f.weight, 0) / 100);

  let anomaly = 0;
  let score: number;
  if (detector.forest) {
    // Relative anomaly: >1 means “worse than anything in the archive”.
    anomaly = Math.min(
      detector.forest.score(x) / detector.maxBenignAnomaly,
      1.2,
    );
    score = calibrate(anomaly, evidence);
  } else {
    score = Math.min(59, calibrate(0, evidence * 0.85));
  }

  const verdict = verdictFor(score);
  const band = bandFor(score);
  return {
    session: s,
    baseline: b,
    score,
    verdict,
    factors,
    anomalyVote: anomaly,
    headline: `${band.label} — ${verdictLabel(verdict)} (${score}/100)`,
  };
}

/** Score every session in the sample log archive. */
export function scoreAllSessions(sessions: SessionLog[]): SessionRisk[] {
  // Train the forest on benign history only (one-class).
  const benign = sessions.filter((s) => !s.attackStory);
  const baselines = buildBaselines(benign);

  const benignByUser = new Map<string, SessionLog[]>();
  for (const s of benign) {
    const list = benignByUser.get(s.user) ?? [];
    list.push(s);
    benignByUser.set(s.user, list);
  }

  const detectors = new Map<string, UserDetector>();
  for (const [user, list] of benignByUser) {
    detectors.set(user, trainUserDetector(list, baselines.get(user)!));
  }

  return sessions.map((s) => {
    const detector = detectors.get(s.user) ?? {
      forest: null,
      maxBenignAnomaly: 1,
      baseline: baselineFor(baselines, s.user),
      history: [],
    };
    const prev = previousSessionBefore(sessions, s.user, s.ts);
    return scoreSession(s, prev, detector);
  });
}

/** Rule-based factor attribution — the "Reasons" ledger on the dossier. */
function attributeFactors(
  s: SessionLog,
  b: Baseline,
  prev: SessionLog | null,
): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const hour = localHour(s.ts, b.homeTzOffset);

  // Unusual login hour (15-min grace around the archive's working window)
  if (hour < b.loginHourStart - 0.25 || hour > b.loginHourEnd + 0.25) {
    const fmtH = (h: number) => {
      const hh = Math.floor(h) % 24;
      const mm = Math.round((h - Math.floor(h)) * 60);
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };
    factors.push({
      code: "UNUSUAL_HOUR",
      label: "Unusual login time",
      weight: 22,
      detail: `${fmtH(hour)} ${b.homeTzLabel} vs usual ${fmtH(b.loginHourStart)}–${fmtH(b.loginHourEnd)}`,
    });
  }

  // Unseen device / browser pair
  if (!b.devices.includes(`${s.device} — ${s.browser}`)) {
    factors.push({
      code: "NEW_DEVICE",
      label: "Unseen device / browser",
      weight: 16,
      detail: `${s.device} — ${s.browser} not in the archive`,
    });
  }

  // Unfamiliar network
  if (!b.ips.includes(s.ip)) {
    factors.push({
      code: "NEW_IP",
      label: "Unfamiliar network",
      weight: 8,
      detail: `${s.ip} never observed for ${s.user}`,
    });
  }

  // Impossible travel: short gap between consecutive logins, huge distance
  if (prev) {
    const km = haversineKm(prev.lat, prev.lon, s.lat, s.lon);
    const gapH = Math.abs(s.ts - prev.ts) / 3_600_000;
    if (km > 500 && gapH < 14) {
      factors.push({
        code: "IMPOSSIBLE_TRAVEL",
        label: "Impossible travel",
        weight: 26,
        detail: `${Math.round(km).toLocaleString()} km from the prior session (${prev.city}) with only ${gapH.toFixed(1)} h between logins`,
      });
    }
  }

  // Download volume spike
  if (s.fileDownloads > b.downloadsMax * 3 && s.fileDownloads > 25) {
    const ratio = (s.fileDownloads / Math.max(1, b.downloadsMax)).toFixed(1);
    factors.push({
      code: "DOWNLOAD_SPIKE",
      label: "Abnormal download volume",
      weight: 24,
      detail: `${s.fileDownloads.toLocaleString()} files — ${ratio}× the usual ceiling of ${b.downloadsMax}`,
    });
  }

  // API burst
  if (s.apiCalls > b.apiCallsMax * 3 && s.apiCalls > 400) {
    const ratio = (s.apiCalls / Math.max(1, b.apiCallsMax)).toFixed(1);
    factors.push({
      code: "API_BURST",
      label: "API call burst",
      weight: 12,
      detail: `${s.apiCalls.toLocaleString()} calls — ${ratio}× the usual ceiling of ${b.apiCallsMax}`,
    });
  }

  // First-time sensitive resource
  const newResources = s.sensitiveResources.filter(
    (r) => !b.familiarResources.includes(r),
  );
  if (newResources.length > 0) {
    factors.push({
      code: "NEW_RESOURCE",
      label: "First-time access to sensitive records",
      weight: 14,
      detail: `${newResources.join(", ")} never opened before by ${s.user}`,
    });
  }

  // Unfamiliar privileged commands
  const newActions = s.privilegedActions.filter(
    (a) => !b.familiarActions.includes(a),
  );
  if (newActions.length > 0) {
    factors.push({
      code: "NEW_ACTION",
      label: "Unfamiliar privileged commands",
      weight: 10,
      detail: newActions.join(", "),
    });
  }

  return factors;
}
