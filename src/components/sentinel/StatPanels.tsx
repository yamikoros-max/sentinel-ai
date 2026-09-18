import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Clock,
  Flame,
  Gauge,
  PieChart,
  Radio,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  Pie,
  PieChart as RePieChart,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fmtArchiveShort,
  scoreColorHex,
  verdictColorHex,
  verdictStyle,
} from "@/lib/sentinel/ui";
import type { Verdict } from "@/lib/sentinel/types";
import { cn } from "@/lib/utils";

const VERDICTS: Verdict[] = ["allow", "monitor", "challenge", "block"];
const VERDICT_LABEL: Record<Verdict, string> = {
  allow: "Allow",
  monitor: "Monitor",
  challenge: "Challenge MFA",
  block: "Block + Alert",
};

const TOOLTIP_STYLE = {
  backgroundColor: "#f4ecdb",
  border: "1px solid #c9b88f",
  fontFamily: "'EB Garamond', serif",
  fontSize: 12,
} as const;

const MONO_TICK = {
  fontSize: 9,
  fill: "#7a6a4f",
  fontFamily: "'Courier Prime', monospace",
} as const;

export interface StatSession {
  sessionId: string;
  user: string;
  ts: number;
  score: number;
  verdict: Verdict;
  downloads: number;
  apiCalls: number;
  city: string;
  headline?: string;
  attackStory: boolean;
}

/** Animate a number from its previous value to `target` with an ease-out. */
function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ── Bureau statistics strip ─────────────────────────────────────────────────

/** Four animated counters summarizing the current session view. */
export function BureauStats({ sessions }: { sessions: StatSession[] }) {
  const total = sessions.length;
  const avg = total ? sessions.reduce((a, s) => a + s.score, 0) / total : 0;
  const peak = total ? Math.max(...sessions.map((s) => s.score)) : 0;
  const critical = sessions.filter((s) => s.score >= 80).length;
  const lastTs = total ? Math.max(...sessions.map((s) => s.ts)) : 0;
  const recent = sessions.filter((s) => lastTs - s.ts < 24 * 3_600_000).length;

  const cards = [
    {
      label: "Sessions on file",
      value: total,
      sub: `${recent} in the last 24 h window`,
      icon: ScrollText,
      tone: "text-foreground",
    },
    {
      label: "Average risk",
      value: Math.round(avg),
      sub: "across the archive",
      icon: Gauge,
      tone: scoreToneClass(avg),
    },
    {
      label: "Peak risk",
      value: peak,
      sub: "highest score observed",
      icon: Flame,
      tone: scoreToneClass(peak),
    },
    {
      label: "Critical verdicts",
      value: critical,
      sub: critical > 0 ? "requiring SOC action" : "all quiet on the desk",
      icon: ShieldAlert,
      tone: critical > 0 ? "text-destructive" : "text-chart-1",
    },
  ];

  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="texture-paper border-border/70 bg-card/80 py-3">
          <CardContent className="flex items-center gap-3 px-4">
            <c.icon className="size-5 shrink-0 text-primary/70" />
            <div className="min-w-0 flex-1">
              <p className={cn("font-mono text-2xl font-bold tabular-nums", c.tone)}>
                <Counted value={c.value} />
              </p>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {c.label}
              </p>
            </div>
            <p className="hidden max-w-[110px] text-right font-serif text-[11px] italic leading-tight text-muted-foreground lg:block">
              {c.sub}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function Counted({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{Math.round(v).toLocaleString()}</>;
}

function scoreToneClass(score: number): string {
  if (score < 30) return "text-chart-1";
  if (score < 60) return "text-chart-2";
  if (score < 80) return "text-chart-3";
  return "text-destructive";
}

// ── Verdict distribution donut ──────────────────────────────────────────────

/** Donut of verdict distribution with the total in the hole. */
export function VerdictDonut({ sessions }: { sessions: StatSession[] }) {
  const data = useMemo(
    () =>
      VERDICTS.map((v) => ({
        name: VERDICT_LABEL[v],
        value: sessions.filter((s) => s.verdict === v).length,
        color: verdictColorHex(v),
      })).filter((d) => d.value > 0),
    [sessions],
  );
  const total = sessions.length;

  return (
    <Card className="texture-paper border-border/70 bg-card/80">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <PieChart className="size-4 text-primary" />
          Verdict Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="62%"
                outerRadius="88%"
                paddingAngle={2}
                stroke="#f4ecdb"
                strokeWidth={1.5}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </RePieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-mono text-3xl font-bold text-foreground">{total}</p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              sessions
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {VERDICTS.map((v) => {
            const st = verdictStyle(v);
            const n = sessions.filter((s) => s.verdict === v).length;
            return (
              <span key={v} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <span className={cn("size-2 rounded-full", st.dot)} />
                {VERDICT_LABEL[v]} · {n}
              </span>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Risk over time ──────────────────────────────────────────────────────────

/** Chronological risk scores with the 30/60/80 verdict rails drawn in. */
export function RiskTrendChart({ sessions }: { sessions: StatSession[] }) {
  const data = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => a.ts - b.ts)
        .map((s) => ({
          label: fmtArchiveShort(s.ts),
          score: s.score,
          user: s.user,
          incident: s.attackStory,
          color: scoreColorHex(s.score),
        })),
    [sessions],
  );

  return (
    <Card className="texture-paper border-border/70 bg-card/80">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Activity className="size-4 text-primary" />
          Risk Over Time — Verdict Rails
        </CardTitle>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          dashed rules mark the 30 · 60 · 80 dispatch thresholds
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8a5a2b" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8a5a2b" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(92,74,46,0.15)" />
              <XAxis dataKey="label" tick={MONO_TICK} interval="preserveStartEnd" minTickGap={48} />
              <YAxis domain={[0, 100]} tick={MONO_TICK} width={30} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {[30, 60, 80].map((y) => (
                <ReferenceLine
                  key={y}
                  y={y}
                  stroke="rgba(92,74,46,0.4)"
                  strokeDasharray="5 4"
                  label={{
                    value: String(y),
                    position: "left",
                    fontSize: 8,
                    fill: "#7a6a4f",
                    fontFamily: "'Courier Prime', monospace",
                  }}
                />
              ))}
              <Area
                type="monotone"
                dataKey="score"
                stroke="#8a5a2b"
                strokeWidth={2}
                fill="url(#riskFill)"
                dot={(props: {
                  cx?: number;
                  cy?: number;
                  index?: number;
                  payload?: { color: string; incident: boolean };
                }) => {
                  const { cx = 0, cy = 0, index = 0, payload } = props;
                  return (
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={payload?.incident ? 5 : 2}
                      fill={payload?.incident ? "#8e3b2f" : (payload?.color ?? "#8a5a2b")}
                      stroke={payload?.incident ? "#f4ecdb" : "none"}
                      strokeWidth={payload?.incident ? 1.5 : 0}
                    />
                  );
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Activity heatmap by UTC hour ────────────────────────────────────────────

/**
 * 24-cell grid of session activity by UTC hour, shaded by peak risk.
 * Clicking a cell filters the case ledger to that hour.
 */
export function HourHeatmap({
  sessions,
  activeHour,
  onPickHour,
}: {
  sessions: StatSession[];
  activeHour: number | null;
  onPickHour: (h: number) => void;
}) {
  const buckets = useMemo(() => {
    const b = Array.from({ length: 24 }, () => ({ count: 0, max: 0 }));
    for (const s of sessions) {
      const h = new Date(s.ts).getUTCHours();
      b[h]!.count += 1;
      b[h]!.max = Math.max(b[h]!.max, s.score);
    }
    return b;
  }, [sessions]);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <Card className="texture-paper border-border/70 bg-card/80">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Clock className="size-4 text-primary" />
          Activity by Hour — UTC
        </CardTitle>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          shading = peak risk · click a cell to filter the ledger
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-12 gap-1">
          {buckets.map((b, h) => {
            const intensity = b.count === 0 ? 0 : 0.25 + 0.75 * (b.count / maxCount);
            const active = activeHour === h;
            return (
              <button
                key={h}
                onClick={() => onPickHour(h)}
                title={
                  b.count === 0
                    ? `${String(h).padStart(2, "0")}:00 — no sessions`
                    : `${String(h).padStart(2, "0")}:00 — ${b.count} session${b.count > 1 ? "s" : ""}, peak risk ${b.max}`
                }
                className={cn(
                  "flex h-12 flex-col items-center justify-center rounded-sm border transition-all hover:scale-105",
                  active
                    ? "border-primary ring-2 ring-primary/60"
                    : "border-border/50 hover:border-primary/50",
                )}
                style={{
                  backgroundColor:
                    b.count === 0 ? "transparent" : scoreColorHex(b.max),
                  opacity: b.count === 0 ? 0.5 : intensity,
                }}
              >
                <span className="font-mono text-[9px] font-bold text-background drop-shadow-sm">
                  {b.count || ""}
                </span>
                <span className="font-mono text-[8px] text-background/90">
                  {String(h).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Factor frequency across the view ────────────────────────────────────────

const RANK_COLORS = ["#8e3b2f", "#8a5a2b", "#b08d3e", "#a08856", "#8f7d58", "#7a6a4f"];

/** Horizontal bars of total rule-evidence weight per factor code, top 6. */
export function FactorFrequencyChart({
  factorSets,
}: {
  factorSets: { code: string; label: string; weight: number }[][];
}) {
  const data = useMemo(() => {
    const agg = new Map<string, { code: string; label: string; weight: number; count: number }>();
    for (const set of factorSets) {
      for (const f of set) {
        const cur = agg.get(f.code) ?? { code: f.code, label: f.label, weight: 0, count: 0 };
        cur.weight += f.weight;
        cur.count += 1;
        agg.set(f.code, cur);
      }
    }
    return [...agg.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((d, i) => ({
        short: d.label.replace(/ — .*/, "").replace("First-time access to sensitive records", "New sensitive access"),
        weight: d.weight,
        count: d.count,
        color: RANK_COLORS[i] ?? "#7a6a4f",
      }));
  }, [factorSets]);

  return (
    <Card className="texture-paper border-border/70 bg-card/80">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <BarChart3 className="size-4 text-primary" />
          Top Risk Factors — Evidence Weight
        </CardTitle>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          summed rule weights across {factorSets.length} dossiers
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-10 text-center font-serif text-sm italic text-muted-foreground">
            No anomalies recorded in this view — the archive is quiet.
          </p>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(92,74,46,0.12)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="short"
                  width={140}
                  tick={{ ...MONO_TICK, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(92,74,46,0.06)" }} />
                <Bar dataKey="weight" radius={[0, 3, 3, 0]} barSize={14}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Session vs archive radar ────────────────────────────────────────────────

/** Five-axis radar of one session's intensity, normalized against the archive. */
export function SessionRadar({
  downloads,
  downloadsCeiling,
  apiCalls,
  apiCeiling,
  uploads,
  anomalyVote,
  factorWeight,
}: {
  downloads: number;
  downloadsCeiling: number;
  apiCalls: number;
  apiCeiling: number;
  uploads: number;
  anomalyVote: number;
  factorWeight: number;
}) {
  const norm = (v: number, c: number) => Math.min(100, Math.round((v / Math.max(1, c)) * 100));
  const data = [
    { axis: "Downloads", value: norm(downloads, downloadsCeiling) },
    { axis: "API calls", value: norm(apiCalls, apiCeiling) },
    { axis: "Uploads", value: Math.min(100, uploads * 25) },
    { axis: "Anomaly", value: Math.min(100, Math.round(anomalyVote * 100)) },
    { axis: "Evidence", value: Math.min(100, factorWeight) },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="78%">
        <PolarGrid stroke="rgba(92,74,46,0.25)" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fontSize: 9, fill: "#7a6a4f", fontFamily: "'Courier Prime', monospace" }}
        />
        <Radar
          dataKey="value"
          stroke="#8a5a2b"
          strokeWidth={2}
          fill="#8a5a2b"
          fillOpacity={0.28}
          dot={{ r: 2.5, fill: "#8e3b2f", strokeWidth: 0 }}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Live ticker ─────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return fmtArchiveShort(ts);
}

/** Auto-advancing ticker of the most recent sessions; pauses on hover. */
export function LiveTicker({ sessions }: { sessions: StatSession[] }) {
  const recent = useMemo(
    () => [...sessions].sort((a, b) => b.ts - a.ts).slice(0, 10),
    [sessions],
  );
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIdx(0);
  }, [recent.length]);

  useEffect(() => {
    if (paused || recent.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % recent.length), 3500);
    return () => clearInterval(t);
  }, [paused, recent.length]);

  if (recent.length === 0) return null;
  const item = recent[idx % recent.length]!;
  const st = verdictStyle(item.verdict);

  return (
    <Card
      className="texture-paper mb-6 border-border/70 bg-card/80 py-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <CardContent className="flex items-center gap-4 px-4">
        <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <Radio className={cn("size-3.5 text-primary", !paused && "animate-pulse")} />
          Signals
        </span>
        <div className="relative h-9 min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.sessionId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex h-9 items-center gap-3"
            >
              <span className={cn("size-2 shrink-0 rounded-full", st.dot)} />
              <span className="truncate font-serif text-sm font-semibold">{item.user}</span>
              <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:block">
                {item.headline ?? item.city}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {timeAgo(item.ts)}
                </span>
                <span className={cn("font-mono text-sm font-bold", scoreToneClass(item.score))}>
                  {item.score}
                </span>
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
