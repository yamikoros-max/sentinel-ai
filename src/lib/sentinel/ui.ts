import type { RiskFactor, Verdict } from "./types";
import type { Baseline } from "./types";

export interface VerdictStyle {
  stamp: string; // e.g. "BLOCKED"
  tone: string; // tailwind text color
  ring: string; // tailwind border color
  fill: string; // tailwind bg color
  dot: string; // small indicator bg
}

export function verdictStyle(v: Verdict): VerdictStyle {
  switch (v) {
    case "allow":
      return {
        stamp: "Allowed",
        tone: "text-chart-1",
        ring: "border-chart-1/50",
        fill: "bg-chart-1/10",
        dot: "bg-chart-1",
      };
    case "monitor":
      return {
        stamp: "Monitor",
        tone: "text-chart-2",
        ring: "border-chart-2/50",
        fill: "bg-chart-2/10",
        dot: "bg-chart-2",
      };
    case "challenge":
      return {
        stamp: "Challenge MFA",
        tone: "text-chart-3",
        ring: "border-chart-3/50",
        fill: "bg-chart-3/10",
        dot: "bg-chart-3",
      };
    case "block":
      return {
        stamp: "Blocked",
        tone: "text-destructive",
        ring: "border-destructive/50",
        fill: "bg-destructive/10",
        dot: "bg-destructive",
      };
  }
}

export function scoreTone(score: number): string {
  if (score < 30) return "text-chart-1";
  if (score < 60) return "text-chart-2";
  if (score < 80) return "text-chart-3";
  return "text-destructive";
}

export function scoreColorHex(score: number): string {
  // Matches the vintage palette: sage → brass → sepia ink → oxblood.
  if (score < 30) return "#6b8f71";
  if (score < 60) return "#b08d3e";
  if (score < 80) return "#8a5a2b";
  return "#8e3b2f";
}

export function verdictColorHex(v: Verdict): string {
  switch (v) {
    case "allow":
      return "#6b8f71";
    case "monitor":
      return "#b08d3e";
    case "challenge":
      return "#8a5a2b";
    case "block":
      return "#8e3b2f";
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format an epoch ms timestamp in a fixed archive style (UTC). */
export function fmtArchive(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${hh}:${mm} UTC`;
}

export function fmtArchiveShort(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${hh}:${mm}`;
}

/** Human-readable baseline description for the LLM prompt. */
export function baselineSummary(b: Baseline): string {
  const hours = `${Math.floor(b.loginHourStart)}:00–${Math.floor(b.loginHourEnd)}:00 ${b.homeTzLabel}`;
  return [
    `Home base ${b.homeCity}, ${b.homeCountry}.`,
    `Usually logs in between ${hours}.`,
    `Known devices: ${b.devices.join("; ") || "none"}.`,
    `Usually downloads ${b.downloadsMin}–${b.downloadsMax} files/day and makes up to ${b.apiCallsMax} API calls.`,
    `Familiar resources: ${b.familiarResources.join(", ") || "none"}.`,
    `Familiar privileged actions: ${b.familiarActions.join(", ") || "none"}.`,
  ].join(" ");
}

export function factorsToPrompt(factors: RiskFactor[]): string {
  return factors
    .map((f) => `- ${f.label} (weight ${f.weight}): ${f.detail}`)
    .join("\n");
}
