// ─── SentinelAI domain types ────────────────────────────────────────────────

/** A raw telemetry session, as ingested from login / API / file / device logs. */
export interface SessionLog {
  id: string;
  user: string;
  ts: number; // epoch ms
  ip: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  device: string;
  browser: string;
  /** Sensitive resources touched this session (payroll, ledger, exports…) */
  sensitiveResources: string[];
  fileDownloads: number;
  fileUploads: number;
  apiCalls: number;
  /** Commands / privileged actions performed */
  privilegedActions: string[];
  /** Authentication factors that passed */
  authPassed: ("password" | "otp")[];
  /** Raw note lines shown verbatim in the dossier ledger */
  notes: string[];
  /** Marks the curated "attack story" session used in the demo */
  attackStory?: boolean;
}

/** Everything the ML scoring needs about one user's normal behavior. */
export interface Baseline {
  user: string;
  homeCity: string;
  homeCountry: string;
  lat: number;
  lon: number;
  /** Home timezone label, e.g. "IST" */
  homeTzLabel: string;
  /** Home timezone offset from UTC in hours */
  homeTzOffset: number;
  loginHourStart: number; // inclusive, local hours
  loginHourEnd: number; // inclusive, local hours
  /** Devices + browsers seen before, "Device — Browser" */
  devices: string[];
  ips: string[];
  /** Typical download range per day */
  downloadsMin: number;
  downloadsMax: number;
  /** Typical API calls per day */
  apiCallsMin: number;
  apiCallsMax: number;
  /** Resources the user has touched before */
  familiarResources: string[];
  /** Privileged commands seen before */
  familiarActions: string[];
  sessionsScored: number;
  lastActiveTs: number;
}

export type Verdict = "allow" | "monitor" | "challenge" | "block";

export interface RiskFactor {
  code: string;
  label: string;
  weight: number; // contribution to the score (0–100 scale)
  detail: string; // human-readable evidence, e.g. "03:12 IST vs usual 09:00–19:00"
}

export interface SessionRisk {
  session: SessionLog;
  baseline: Baseline;
  score: number; // 0–100
  verdict: Verdict;
  factors: RiskFactor[];
  /** Fraction of ensemble trees voting anomalous, 0–1 */
  anomalyVote: number;
  /** Short verdict banner line for the dossier */
  headline: string;
}

export interface Dispatch {
  sessionId: string;
  user: string;
  ts: number;
  verdict: Verdict;
  score: number;
  /** "Allowed — behavior matches the archive." */
  note: string;
}

/** Persisted SOC state for one session. */
export interface CaseRecord {
  sessionId: string;
  user: string;
  ts: number;
  score: number;
  verdict: Verdict;
  factors: RiskFactor[];
  anomalyVote: number;
  headline: string;
  memo: string | null; // LLM analyst narrative
  memoModel: string | null;
  dispatched: string; // dispatch note
  reviewed: boolean; // analyst pressed something (mark reviewed / block)
  blocked: boolean;
}
