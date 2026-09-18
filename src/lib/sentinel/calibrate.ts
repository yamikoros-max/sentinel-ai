/**
 * Calibration script — run with: bun run src/lib/sentinel/calibrate.ts
 * Prints verdict distribution and sanity gates for the sample archive.
 */
import { generateSampleSessions } from "./samples";
import { scoreAllSessions } from "./engine";
import type { Verdict } from "./types";

const sessions = generateSampleSessions();
const results = scoreAllSessions(sessions);

const counts: Record<Verdict, number> = {
  allow: 0,
  monitor: 0,
  challenge: 0,
  block: 0,
};
for (const r of results) counts[r.verdict]!++;

console.log("── SentinelAI calibration ──");
console.log(`Total sessions: ${results.length}`);
console.log(
  `Verdicts: allow=${counts.allow} monitor=${counts.monitor} challenge=${counts.challenge} block=${counts.block}`,
);

const benign = results.filter((r) => !r.session.attackStory);
const attack = results.filter((r) => r.session.attackStory);

const benignScores = benign.map((r) => r.score);
const maxBenign = Math.max(...benignScores);
const avgBenign = benignScores.reduce((a, b) => a + b, 0) / benignScores.length;

console.log(
  `Benign: n=${benign.length}  max=${maxBenign}  avg=${avgBenign.toFixed(1)}`,
);
console.log("");

for (const r of attack) {
  console.log(`ATTACK ${r.session.user} — score ${r.score} (${r.verdict})`);
  console.log(`  anomalyVote=${r.anomalyVote.toFixed(3)}`);
  for (const f of r.factors) {
    console.log(`  [${f.weight}] ${f.label}: ${f.detail}`);
  }
}

const ok = maxBenign < 30 && attack[0] !== undefined && attack[0].score >= 80;
console.log("");
console.log(
  ok
    ? "✓ Calibration OK — benign <30, attack ≥80"
    : "✗ CALIBRATION FAILED — benign max must be <30, attack ≥80",
);
