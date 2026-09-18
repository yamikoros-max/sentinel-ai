// SentinelAI landing — vintage archive/bureau aesthetic matching the Watch Room.
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Bot,
  Fingerprint,
  Gauge,
  Globe2,
  KeyRound,
  ScrollText,
  ShieldAlert,
  Timer,
} from "lucide-react";

const RISK_BANDS = [
  { range: "0 – 29", label: "Allow", note: "Behavior matches the archive", dot: "bg-chart-1" },
  { range: "30 – 59", label: "Monitor", note: "Watch quietly, no friction", dot: "bg-chart-2" },
  { range: "60 – 79", label: "Challenge MFA", note: "Step-up verification", dot: "bg-chart-3" },
  { range: "80 – 100", label: "Block + Alert", note: "Freeze account, page the SOC", dot: "bg-destructive" },
];

const CAPABILITIES = [
  {
    icon: Timer,
    title: "Hours of Habit",
    body: "Learns the window in which each employee signs in, in their home timezone — 9 to 7 in Chennai reads differently than 3 a.m. in Belgrade.",
  },
  {
    icon: Fingerprint,
    title: "Device Fingerprints",
    body: "Every machine and browser is catalogued. A Windows Server arriving over Tor stands out immediately against a known Latitude laptop.",
  },
  {
    icon: Globe2,
    title: "Geography & Travel",
    body: "Haversine distance and implied travel speed between sessions — impossible journeys flag themselves.",
  },
  {
    icon: ScrollText,
    title: "Data Volume",
    body: "Usual file ceilings and API rhythms are archived. 1,847 downloads against a ceiling of 12 speaks for itself.",
  },
  {
    icon: KeyRound,
    title: "Beyond Passwords",
    body: "Credentials were valid. OTP passed. SentinelAI scores what authentication cannot see — the behavior around the key.",
  },
  {
    icon: Bot,
    title: "AI Analyst Memo",
    body: "The LLM security analyst converts raw telemetry into a plain-language incident memo with a recommended action.",
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="texture-paper vignette min-h-screen bg-background">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="border-b border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-sm border-2 border-primary/60 bg-primary/10 font-serif text-xl font-bold text-primary">
              S
            </span>
            <div>
              <p className="font-serif text-xl font-bold tracking-wide leading-none">
                SentinelAI
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                Behavioral Security Bureau
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth?returnTo=%2Fdashboard">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth?returnTo=%2Fdashboard">Enter the Watch Room</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Hero ───────────────────────────────────────────────── */}
        <section className="grid items-center gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
              Case File № 001 · Compromised Accounts · Est. MMXXVI
            </p>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-4 font-serif text-5xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl"
            >
              The password was correct.
              <br />
              <span className="text-primary">The behavior was not.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="mt-6 max-w-xl font-serif text-lg leading-8 text-muted-foreground"
            >
              Attackers no longer break in — they log in. SentinelAI studies how
              every user normally behaves, then scores each session against that
              private archive with an Isolation-Forest ensemble and a rule-based
              evidence ledger. Valid credentials, wrong person.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.22 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button size="lg" asChild className="h-11 px-6 text-base">
                <Link to="/auth?returnTo=%2Fdashboard">Open the Case Ledger</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-11 px-6 text-base">
                <Link to="/auth?returnTo=%2Fdashboard">Sign in as analyst</Link>
              </Button>
            </motion.div>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Live demo archive · 52 recorded sessions · one curated incident
            </p>
          </div>

          {/* Hero dossier card */}
          <motion.div
            initial={{ opacity: 0, y: 16, rotate: 1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 1.5 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <Card className="texture-paper deckle border-primary/40 bg-card/90 shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-serif text-lg">Session Dossier</CardTitle>
                  <span className="stamp border-destructive px-2 py-0.5 text-[9px] font-bold text-destructive">
                    Critical
                  </span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Sep 15, 2026 · 03:15 IST · Belgrade, Serbia
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between border-b border-border/60 pb-3">
                  <div>
                    <p className="font-serif text-2xl font-bold">Priya Sharma</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Windows Server — Tor Browser 14
                    </p>
                  </div>
                  <p className="font-mono text-4xl font-bold text-destructive">96</p>
                </div>
                <ul className="space-y-2 font-mono text-[11px] text-muted-foreground">
                  {[
                    "Unusual login time — 03:15 vs usual 09:00–19:00 IST",
                    "Unseen device & browser — fingerprint not in archive",
                    "Impossible travel — 6,620 km in 10.6 h",
                    "Abnormal downloads — 1,847 files, 154× the ceiling",
                    "First-ever access to the payroll register",
                  ].map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <span className="text-destructive">✕</span>
                      {reason}
                    </li>
                  ))}
                </ul>
                <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive">
                  Verdict: Block + Alert — SOC paged
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        <Separator />

        {/* ── How the verdict is reached ─────────────────────────── */}
        <section className="py-14">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            The Risk Engine
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">
            Every session, weighed against the archive
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card className="texture-paper border-border/70 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-serif text-xl">
                  <Gauge className="size-4 text-primary" />
                  Isolation-Forest Ensemble
                </CardTitle>
              </CardHeader>
              <CardContent className="font-serif text-sm leading-6 text-muted-foreground">
                One-class trees are fitted per user on 11 behavioral features —
                hour of day, device novelty, geo distance, download and API
                ratios, first-time resources, travel speed. Anomalies isolate
                faster than habits.
              </CardContent>
            </Card>
            <Card className="texture-paper border-border/70 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-serif text-xl">
                  <ShieldAlert className="size-4 text-primary" />
                  Evidence Ledger
                </CardTitle>
              </CardHeader>
              <CardContent className="font-serif text-sm leading-6 text-muted-foreground">
                Rule-weighted factors — unusual hour, unseen device, unfamiliar
                network, impossible travel, volume spikes — are blended with the
                ensemble vote into one calibrated 0–100 risk score.
              </CardContent>
            </Card>
          </div>

          {/* Verdict ladder */}
          <Card className="texture-paper deckle mt-6 border-border bg-card/85 py-4">
            <CardContent className="grid gap-3 px-4 sm:grid-cols-4">
              {RISK_BANDS.map((b) => (
                <div key={b.range} className="rounded-sm border border-border/60 bg-background/40 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", b.dot)} />
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {b.range}
                    </p>
                  </div>
                  <p className="mt-1 font-serif text-lg font-semibold">{b.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{b.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ── Capabilities ───────────────────────────────────────── */}
        <section className="py-14">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            What the Bureau Studies
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">
            Six habits every impostor forgets to fake
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <Card key={c.title} className="texture-paper border-border/70 bg-card/80 transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <span className="flex size-9 items-center justify-center rounded-sm border border-primary/40 bg-primary/10">
                    <c.icon className="size-4 text-primary" />
                  </span>
                  <CardTitle className="font-serif text-lg leading-snug">{c.title}</CardTitle>
                </CardHeader>
                <CardContent className="font-serif text-sm leading-6 text-muted-foreground">
                  {c.body}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* ── Final CTA ──────────────────────────────────────────── */}
        <section className="py-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="font-serif text-4xl font-bold sm:text-5xl">
              The ledger is open.
            </h2>
            <p className="mx-auto mt-4 max-w-xl font-serif text-lg text-muted-foreground">
              Step into the Watch Room, pull the live incident dossier, and watch
              the AI analyst write the memo that turns raw logs into evidence.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild className="h-11 px-8 text-base">
                <Link to="/auth?returnTo=%2Fdashboard">Enter the Watch Room</Link>
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 sm:flex-row sm:px-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            SentinelAI · Behavioral Security Bureau · Filed MMXXVI
          </p>
          <p className="font-serif text-sm italic text-muted-foreground">
            “Credentials open doors; behavior tells you who walked through.”
          </p>
        </div>
      </footer>
    </div>
  );
}
