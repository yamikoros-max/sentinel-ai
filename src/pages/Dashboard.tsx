import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery, useAction } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RiskDial } from "@/components/sentinel/RiskDial";
import { SessionTimeline } from "@/components/sentinel/SessionTimeline";
import { MemoCard } from "@/components/sentinel/MemoCard";
import OrgSettings from "@/pages/OrgSettings";
import { cn } from "@/lib/utils";
import {
  baselineSummary,
  fmtArchive,
  scoreTone,
  verdictStyle,
} from "@/lib/sentinel/ui";
import type { Verdict } from "@/lib/sentinel/types";
import {
  Archive,
  Building2,
  Fingerprint,
  Globe2,
  KeyRound,
  Landmark,
  LogOut,
  Radio,
  LockOpen,
  ScrollText,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from "lucide-react";

interface SessionSummary {
  sessionId: string;
  user: string;
  ts: number;
  ip: string;
  city: string;
  country: string;
  device: string;
  browser: string;
  score: number;
  verdict: Verdict;
  headline: string;
  anomalyVote: number;
  downloads: number;
  apiCalls: number;
  attackStory: boolean;
}

interface Dossier extends SessionSummary {
  uploads: number;
  factors: { code: string; label: string; weight: number; detail: string }[];
  sensitiveResources: string[];
  privilegedActions: string[];
  authPassed: string[];
  notes: string[];
  baseline: {
    homeCity: string;
    homeCountry: string;
    homeTzLabel: string;
    loginHourStart: number;
    loginHourEnd: number;
    devices: string[];
    downloadsMax: number;
    apiCallsMax: number;
    familiarResources: string[];
    familiarActions: string[];
    sessionsScored: number;
  };
}

interface CaseRecordShape {
  sessionId: string;
  blocked: boolean;
  reviewed: boolean;
  memo?: string | null;
  memoState?: "pending" | "ready" | "failed";
  dispatched: string;
}

const VERDICT_LADDER: Verdict[] = ["allow", "monitor", "challenge", "block"];
const LADDER_LABEL: Record<Verdict, string> = {
  allow: "Allow",
  monitor: "Monitor",
  challenge: "Challenge MFA",
  block: "Block + Alert",
};
const LADDER_RANGE: Record<Verdict, string> = {
  allow: "0–29",
  monitor: "30–59",
  challenge: "60–79",
  block: "80–100",
};

interface LiveSessionRow {
  sessionId: string;
  user: string;
  userLabel?: string;
  ts: number;
  score: number;
  verdict: Verdict;
  headline: string;
  anomalyVote: number;
  downloads: number;
  apiCalls: number;
  uploads: number;
  factors: { code: string; label: string; weight: number; detail: string }[];
  coldStart: boolean;
  memo: string | null;
  memoState?: "pending" | "ready" | "failed";
  userBlocked?: boolean;
  blockSource?: "manual" | "auto" | null;
  ip: string;
  city: string;
  country: string;
  device: string;
  browser: string;
  sensitiveResources: string[];
  privilegedActions: string[];
  notes: string[];
  role: "admin" | "member";
}

interface OrgLite {
  orgId: string;
  name: string;
  domain: string;
  role: "admin" | "member";
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Org switcher: read ?org=, default to the user's first org ──
  const myOrgs = useQuery(api.orgs.listMyOrgs) as OrgLite[] | undefined;
  const activeOrgId = searchParams.get("org");
  const activeOrg = myOrgs?.find((o) => o.orgId === activeOrgId) ?? null;

  // No ?org= — default to first membership; none → onboarding.
  useEffect(() => {
    if (myOrgs === undefined) return;
    if (!activeOrgId) {
      if (myOrgs.length > 0) {
        setSearchParams({ org: myOrgs[0]!.orgId }, { replace: true });
      }
      // myOrgs.length === 0 → show onboarding prompt inline.
    } else if (myOrgs.length > 0 && !myOrgs.some((o) => o.orgId === activeOrgId)) {
      setSearchParams({ org: myOrgs[0]!.orgId }, { replace: true });
    }
  }, [myOrgs, activeOrgId, setSearchParams]);

  const [mode, setMode] = useState<"live" | "demo" | "settings">("live");

  // ── Demo archive data (always fetched; cheap and cached) ──────
  const demoSessions = useQuery(api.sentinel.listSessions) as
    | SessionSummary[]
    | undefined;
  const demoWatchlist = useQuery(api.sentinel.listUsers) as
    | { user: string; maxScore: number; sessions: number }[]
    | undefined;
  const allCases = useQuery(api.sentinel.listCases) as
    | CaseRecordShape[]
    | undefined;

  // ── Live tenant data (only when an org is active) ─────────────
  const liveSessions = useQuery(
    api.orgs.listLiveSessions,
    activeOrgId ? ({ orgId: activeOrgId } as never) : "skip",
  ) as LiveSessionRow[] | undefined;
  const liveWatchlist = useQuery(
    api.orgs.listLiveUsers,
    activeOrgId ? ({ orgId: activeOrgId } as never) : "skip",
  ) as { user: string; maxScore: number; sessions: number }[] | undefined;

  const isLive = mode === "live" && activeOrg !== null;

  const sessions: SessionSummary[] | undefined = isLive
    ? liveSessions?.map((r) => ({
        sessionId: r.sessionId,
        user: r.userLabel ?? r.user,
        ts: r.ts,
        ip: r.ip,
        city: r.city,
        country: r.country,
        device: r.device,
        browser: r.browser,
        score: r.score,
        verdict: r.verdict,
        headline: r.headline,
        anomalyVote: r.anomalyVote,
        downloads: r.downloads,
        apiCalls: r.apiCalls,
        attackStory: false,
      }))
    : demoSessions;
  const watchlist = isLive ? liveWatchlist : demoWatchlist;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  // Reset selection when switching org or mode.
  useEffect(() => {
    setSelectedId(null);
  }, [activeOrgId, mode]);

  // Default to the live incident so the demo opens on the attack story.
  useEffect(() => {
    if (!selectedId && sessions && sessions.length > 0) {
      const incident = sessions.find((s) => s.attackStory);
      setSelectedId(incident?.sessionId ?? sessions[0]!.sessionId);
    }
  }, [sessions, selectedId]);

  // Dossier: live sessions query their own table; demo archive uses the demo query.
  const liveDossier = useQuery(
    api.orgs.getLiveSession,
    selectedId && isLive ? ({ sessionId: selectedId } as never) : "skip",
  ) as LiveSessionRow | undefined;
  const demoDossier = useQuery(
    api.sentinel.getSession,
    selectedId && !isLive ? { sessionId: selectedId } : "skip",
  ) as Dossier | undefined;
  const dossier: Dossier | undefined = isLive
    ? (liveDossier as unknown as Dossier | undefined)
    : demoDossier;

  const recordCase = useMutation(api.sentinel.recordCase);
  const blockUser = useMutation(api.sentinel.blockUser);
  const unblockCase = useMutation(api.sentinel.unblockCase);
  const setUserBlocked = useMutation(api.orgs.setUserBlocked);
  const markReviewed = useMutation(api.sentinel.markReviewed);
  const markLiveReviewed = useMutation(api.orgs.markLiveReviewed);
  const explainCase = useAction(api.sentinel.explainCase);
  const explainLiveCase = useAction(api.orgs.explainLiveCase);

  // Open a case file the first time a demo dossier is viewed (idempotent).
  const recordedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!dossier || isLive) return;
    const known =
      allCases?.some((c) => c.sessionId === dossier.sessionId) ?? false;
    if (known || recordedRef.current.has(dossier.sessionId)) return;
    recordedRef.current.add(dossier.sessionId);
    recordCase({
      sessionId: dossier.sessionId,
      user: dossier.user,
      ts: dossier.ts,
      score: dossier.score,
      verdict: dossier.verdict,
      headline: dossier.headline,
      anomalyVote: dossier.anomalyVote,
      dispatched: dispatchNote(dossier.verdict),
      factors: dossier.factors,
    }).catch(() => recordedRef.current.delete(dossier.sessionId));
  }, [dossier, allCases, recordCase]);

  const sorted = useMemo(
    () => (sessions ? [...sessions].sort((a, b) => b.score - a.score) : []),
    [sessions],
  );
  const caseFor = allCases?.find((c) => c.sessionId === selectedId);
  const vs = dossier ? verdictStyle(dossier.verdict) : null;
  const liveModeActive = isLive && dossier !== undefined;
  const liveRole: "admin" | "member" | null =
    isLive ? (liveDossier?.role ?? liveSessions?.[0]?.role ?? null) : null;
  // Current blocked state of the selected account (live override list or demo case stamp).
  const isBlockedNow = isLive
    ? (liveDossier?.userBlocked ?? false)
    : (caseFor?.blocked ?? false);

  const handleBlock = async () => {
    if (!dossier) return;
    setBlockOpen(false);
    try {
      if (liveModeActive) {
        await setUserBlocked({
          orgId: activeOrgId as never,
          user: (liveDossier?.user ?? dossier.user) as never,
          userLabel: dossier.user,
          blocked: true,
          reason: `Blocked manually from the dossier of session ${dossier.sessionId}.`,
        } as never);
      } else {
        await blockUser({ sessionId: dossier.sessionId, user: dossier.user });
      }
      toast("Account blocked", {
        description: `${dossier.user} is blocked org-wide — future sessions will be denied until unblocked.`,
      });
    } catch {
      toast.error("Could not stamp the block — try again.");
    }
  };

  const handleUnblock = async () => {
    if (!dossier) return;
    try {
      if (liveModeActive) {
        await setUserBlocked({
          orgId: activeOrgId as never,
          user: (liveDossier?.user ?? dossier.user) as never,
          blocked: false,
        } as never);
      } else {
        await unblockCase({ sessionId: dossier.sessionId });
      }
      toast("Account unblocked", {
        description: `${dossier.user} can sign in again — the engine keeps monitoring.`,
      });
    } catch {
      toast.error("Could not unblock — try again.");
    }
  };

  const handleReview = async () => {
    if (!dossier) return;
    try {
      if (liveModeActive) {
        await markLiveReviewed({ sessionId: dossier.sessionId } as never);
      } else {
        await markReviewed({ sessionId: dossier.sessionId });
      }
      toast("Case marked reviewed", {
        description: "Filed to the archive without a block.",
      });
    } catch {
      toast.error("Could not mark reviewed — try again.");
    }
  };

  const handleSummon = async (): Promise<string> => {
    if (!dossier) throw new Error("No dossier loaded.");
    if (liveModeActive) {
      return explainLiveCase({ sessionId: dossier.sessionId } as never);
    }
    return explainCase({
      sessionId: dossier.sessionId,
      user: dossier.user,
      score: dossier.score,
      verdict: dossier.verdict,
      headline: dossier.headline,
      factors: dossier.factors,
      notes: dossier.notes,
      baselineSummary: baselineSummary({
        user: dossier.user,
        homeCity: dossier.baseline.homeCity,
        homeCountry: dossier.baseline.homeCountry,
        lat: 0,
        lon: 0,
        homeTzLabel: dossier.baseline.homeTzLabel,
        homeTzOffset: 0,
        loginHourStart: dossier.baseline.loginHourStart,
        loginHourEnd: dossier.baseline.loginHourEnd,
        devices: dossier.baseline.devices,
        ips: [],
        downloadsMin: 0,
        downloadsMax: dossier.baseline.downloadsMax,
        apiCallsMin: 0,
        apiCallsMax: dossier.baseline.apiCallsMax,
        familiarResources: dossier.baseline.familiarResources,
        familiarActions: dossier.baseline.familiarActions,
        sessionsScored: dossier.baseline.sessionsScored,
        lastActiveTs: 0,
      }),
    });
  };

  return (
    <div className="texture-paper vignette min-h-screen bg-background">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="border-b border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Behavioral Security Bureau · Est. MMXXVI
            </p>
            <h1 className="font-serif text-3xl font-bold tracking-wide text-foreground sm:text-4xl">
              SentinelAI <span className="text-primary">Watch Room</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Org switcher */}
            {myOrgs !== undefined && myOrgs.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Building2 className="size-3.5" />
                    {activeOrg ? activeOrg.name : "Switch domain"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="texture-paper bg-card">
                  <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Your domains
                  </DropdownMenuLabel>
                  {myOrgs.map((o) => (
                    <DropdownMenuItem
                      key={o.orgId}
                      onClick={() => setSearchParams({ org: o.orgId })}
                      className={cn(o.orgId === activeOrgId && "bg-accent/20")}
                    >
                      <Building2 className="mr-2 size-3.5 text-primary" />
                      <span className="font-serif">{o.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        {o.domain} · {o.role}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/onboarding")}>
                    <Landmark className="mr-2 size-3.5 text-primary" />
                    Claim another domain
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {activeOrg && (
              <Button
                variant={mode === "settings" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode(mode === "settings" ? "live" : "settings")}
                className="gap-2"
              >
                <Settings2 className="size-3.5" />
                Domain
              </Button>
            )}
            <div className="text-right">
              <p className="font-serif text-sm font-semibold text-foreground">
                {user?.name ?? "Analyst on Duty"}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {user?.email ?? "anonymous session"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void signOut();
              }}
              className="gap-2"
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Domain settings view */}
        {mode === "settings" && activeOrgId ? (
          <OrgSettings orgId={activeOrgId} />
        ) : (
        <>
        {/* ── Watchlist strip ────────────────────────────────────── */}
        {/* ── Mode bar ─────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-sm border border-border bg-card/70 p-1">
            {(["live", "demo"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={m === "live" && activeOrg === null}
                className={cn(
                  "px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  mode === m
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                  m === "live" && activeOrg === null && "cursor-not-allowed opacity-40",
                )}
              >
                {m === "live"
                  ? activeOrg === null
                    ? "Live feed — claim a domain"
                    : "Live domain feed"
                  : "Demo archive"}
              </button>
            ))}
          </div>
          {isLive && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {liveRole === "member"
                ? "Member view — IPs, devices & resources redacted"
                : "Admin view — full session detail"}
            </p>
          )}
        </div>
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          {(watchlist ?? []).map((w) => (
            <Card
              key={w.user}
              className="texture-paper border-border/70 bg-card/80 py-3"
            >
              <CardContent className="flex items-center justify-between gap-3 px-4">
                <div>
                  <p className="font-serif text-base font-semibold">{w.user}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {w.sessions} sessions on file
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("font-mono text-2xl font-bold", scoreTone(w.maxScore))}>
                    {w.maxScore}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    peak risk
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
          {/* ── Case ledger ──────────────────────────────────────── */}
          <Card className="texture-paper deckle border-border bg-card/85">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-serif text-xl">
                <ScrollText className="size-4 text-primary" />
                Case Ledger
              </CardTitle>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {sorted.length} sessions · sorted by risk
              </p>
            </CardHeader>
            <Separator />
            <ScrollArea className="h-[560px]">
              <div className="divide-y divide-border/50">
                {sorted.map((s) => {
                  const st = verdictStyle(s.verdict);
                  const active = s.sessionId === selectedId;
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => setSelectedId(s.sessionId)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/20",
                        active && "bg-accent/25",
                      )}
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", st.dot)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-serif text-sm font-semibold text-foreground">
                            {s.user}
                          </span>
                          <span className={cn("font-mono text-sm font-bold", scoreTone(s.score))}>
                            {s.score}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-[10px] text-muted-foreground">
                            {s.city} · {fmtArchive(s.ts).split("·")[1]?.trim()}
                          </span>
                          {s.attackStory ? (
                            <span className="stamp border-destructive px-1 py-px text-[8px] font-bold text-destructive">
                              Incident
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {st.stamp}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>

          {/* ── Dossier ──────────────────────────────────────────── */}
          {!dossier ? (
            <Card className="texture-paper deckle flex min-h-[400px] items-center justify-center border-border bg-card/85">
              <p className="font-serif text-lg text-muted-foreground">
                Select a session from the ledger…
              </p>
            </Card>
          ) : (
            <motion.div
              key={dossier.sessionId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              {/* Dossier header: dial + verdict */}
              <Card className="texture-paper deckle border-border bg-card/85">
                <CardContent className="flex flex-col items-center gap-6 p-6 md:flex-row md:items-center">
                  <RiskDial score={dossier.score} size={200} />
                  <div className="flex-1 space-y-3 text-center md:text-left">
                    <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                      <h2 className="font-serif text-2xl font-bold">
                        {dossier.user}
                      </h2>
                      {isBlockedNow ? (
                        <span className="stamp border-destructive px-2 py-1 text-xs font-bold text-destructive">
                          {isLive && liveDossier?.blockSource === "auto"
                            ? "Auto-Blocked"
                            : "Blocked"}
                        </span>
                      ) : caseFor?.reviewed ? (
                        <span className="stamp border-chart-1 px-2 py-1 text-xs font-bold text-chart-1">
                          Reviewed
                        </span>
                      ) : null}
                      {dossier.attackStory && (
                        <span className="stamp border-destructive px-2 py-1 text-xs font-bold text-destructive">
                          Live Incident
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {fmtArchive(dossier.ts)} · {dossier.city}, {dossier.country} · {dossier.ip}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {dossier.device} — {dossier.browser}
                    </p>
                    {vs && (
                      <p className={cn("font-serif text-lg font-semibold", vs.tone)}>
                        {dossier.headline}
                      </p>
                    )}
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Ensemble anomaly vote {(dossier.anomalyVote * 100).toFixed(0)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Verdict ladder */}
              <Card className="texture-paper border-border/70 bg-card/80 py-4">
                <CardContent className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-4">
                  {VERDICT_LADDER.map((v) => {
                    const st = verdictStyle(v);
                    const active = dossier.verdict === v;
                    return (
                      <div
                        key={v}
                        className={cn(
                          "rounded-sm border px-3 py-2 text-center transition-all",
                          active
                            ? cn(st.ring, st.fill, "shadow-inner")
                            : "border-border/50 opacity-50",
                        )}
                      >
                        <p className={cn("font-mono text-[10px] font-bold uppercase tracking-widest", active ? st.tone : "text-muted-foreground")}>
                          {LADDER_LABEL[v]}
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground">
                          {LADDER_RANGE[v]}
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                {/* Reasons ledger */}
                <Card className="texture-paper border-border/70 bg-card/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 font-serif text-xl">
                      <Fingerprint className="size-4 text-primary" />
                      Reasons — Factor Ledger
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dossier.factors.length === 0 && (
                      <p className="font-serif text-sm italic text-muted-foreground">
                        No anomalies on record — behavior matches the archive.
                      </p>
                    )}
                    {dossier.factors.map((f) => (
                      <div key={f.code} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-serif text-sm font-semibold">{f.label}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            w {f.weight}
                          </p>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-chart-5/70"
                            style={{ width: `${Math.min(100, f.weight * 3)}%` }}
                          />
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {f.detail}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* The archive (baseline) + session facts */}
                <div className="flex flex-col gap-6">
                  <Card className="texture-paper border-border/70 bg-card/80">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 font-serif text-xl">
                        <Archive className="size-4 text-primary" />
                        The Archive — Normal Behavior
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 font-mono text-xs text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <Globe2 className="size-3.5 shrink-0 text-primary/70" />
                        Home base {dossier.baseline.homeCity}, {dossier.baseline.homeCountry}
                      </p>
                      <p className="flex items-center gap-2">
                        <Timer className="size-3.5 shrink-0 text-primary/70" />
                        Usual hours {fmtH(dossier.baseline.loginHourStart)}–{fmtH(dossier.baseline.loginHourEnd)} {dossier.baseline.homeTzLabel}
                      </p>
                      <p className="flex items-center gap-2">
                        <KeyRound className="size-3.5 shrink-0 text-primary/70" />
                        Auth factors passed: {dossier.authPassed.join(" + ")} — credentials were valid
                      </p>
                      <p>
                        Known devices: {dossier.baseline.devices.join(" · ")}
                      </p>
                      <p>
                        Usual ceiling: {dossier.baseline.downloadsMax} downloads/day ·{" "}
                        {dossier.baseline.apiCallsMax} API calls
                      </p>
                      <p>
                        Familiar resources:{" "}
                        {dossier.baseline.familiarResources.join(", ") || "—"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="texture-paper border-border/70 bg-card/80">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 font-serif text-xl">
                        <ShieldAlert className="size-4 text-primary" />
                        This Session vs the Archive
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-3 gap-3 text-center">
                      <Metric label="Downloads" value={dossier.downloads.toLocaleString()} vs={`ceiling ${dossier.baseline.downloadsMax}`} />
                      <Metric label="API calls" value={dossier.apiCalls.toLocaleString()} vs={`ceiling ${dossier.baseline.apiCallsMax.toLocaleString()}`} />
                      <Metric label="Uploads" value={String(dossier.uploads)} vs="usual 0–4" />
                      <div className="col-span-3 space-y-1 pt-1 text-left">
                        {dossier.sensitiveResources.length > 0 && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            <span className="text-chart-5">Sensitive resources:</span>{" "}
                            {dossier.sensitiveResources.join(", ")}
                          </p>
                        )}
                        {dossier.privilegedActions.length > 0 && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            <span className="text-chart-5">Privileged actions:</span>{" "}
                            {dossier.privilegedActions.join(", ")}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Log notes */}
              <Card className="texture-paper border-border/70 bg-card/80">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-serif text-xl">
                    <ShieldCheck className="size-4 text-primary" />
                    Raw Log Excerpts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="ledger-rows space-y-0">
                    {dossier.notes.map((n, i) => (
                      <li key={i} className="flex h-9 items-center gap-2 font-mono text-xs text-muted-foreground">
                        <span className="text-primary/60">›</span>
                        {n}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Charts */}
              <SessionTimeline sessions={sessions ?? []} selectedUser={dossier.user} ceiling={dossier.baseline.downloadsMax} />

              {/* AI memo + actions */}
              <MemoCard
                memo={isLive ? (liveDossier?.memo ?? null) : (caseFor?.memo ?? null)}
                memoState={isLive ? liveDossier?.memoState : caseFor?.memoState}
                onSummon={handleSummon}
              />

              <Card className="texture-paper deckle border-border bg-card/85 py-4">
                <CardContent className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                  <p className="font-serif text-sm italic text-muted-foreground">
                    {caseFor?.dispatched || dispatchNote(dossier.verdict)}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleReview} disabled={caseFor?.reviewed && !isLive}>
                      Mark Reviewed
                    </Button>
                    {isBlockedNow ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUnblock}
                        className="gap-2 border-chart-1/50 text-chart-1 hover:bg-chart-1/10"
                      >
                        <LockOpen className="size-3.5" />
                        Unblock User
                      </Button>
                    ) : (
                      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            Block User
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="texture-paper bg-card">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-serif">
                              Stamp the case file “Blocked”?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {dossier.user} will be blocked org-wide: every future
                              session scores as “block” until an admin unblocks them,
                              regardless of the engine's verdict. Recorded in the archive.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleBlock}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Block User
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
        </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value, vs }: { label: string; value: string; vs: string }) {
  return (
    <div className="rounded-sm border border-border/60 bg-background/40 px-2 py-3">
      <p className="font-mono text-lg font-bold text-foreground">{value}</p>
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono text-[9px] text-primary/70">{vs}</p>
    </div>
  );
}

function fmtH(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dispatchNote(v: Verdict): string {
  switch (v) {
    case "allow":
      return "Dispatched: session allowed — behavior matches the archive.";
    case "monitor":
      return "Dispatched: flagged for continuous monitoring.";
    case "challenge":
      return "Dispatched: step-up MFA challenge issued for this session.";
    case "block":
      return "Dispatched: session terminated, account frozen, SOC paged.";
  }
}
