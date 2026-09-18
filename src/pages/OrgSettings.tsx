import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Ban, Check, Copy, KeyRound, Loader2, LockOpen, Radio, Users } from "lucide-react";

interface OrgOverview {
  orgId: string;
  name: string;
  domain: string;
  role: "admin" | "member";
  members: { email: string; role: string; createdAt: number }[];
  keyCount: number;
  keyPreview: string | null;
}

interface BlockedUserRow {
  user: string;
  userLabel: string | null;
  reason: string;
  source: "manual" | "auto";
  blockedAt: number;
}

interface TestResult {
  sessionId: string;
  score: number;
  verdict: string;
  coldStart: boolean;
}

/**
 * Domain settings: mint ingest API keys, copy the integration snippet,
 * manage members, and fire live test events through the real pipeline.
 */
export default function OrgSettings({ orgId }: { orgId: string }) {
  const overview = useQuery(api.orgs.orgOverview, { orgId } as never) as
    | OrgOverview
    | undefined;
  const blockedUsers = useQuery(api.orgs.listBlockedUsers, { orgId } as never) as
    | BlockedUserRow[]
    | undefined;
  const createKey = useMutation(api.orgs.createIngestKey);
  const sendTest = useMutation(api.orgs.sendTestEvent);
  const setUserBlocked = useMutation(api.orgs.setUserBlocked);

  const [manualUser, setManualUser] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [busyBlocking, setBusyBlocking] = useState<string | null>(null);

  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "snippet" | null>(null);
  const [testing, setTesting] = useState<"benign" | "attack" | null>(null);
  const [lastResult, setLastResult] = useState<(TestResult & { kind: string }) | null>(null);

  const ingestUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/ingest`;

  const mint = async () => {
    try {
      const res = await createKey({ orgId } as never);
      setMintedKey(res.key);
      toast("Ingest key minted — copy it now, it is shown only once.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mint the key.");
    }
  };

  const copy = async (text: string, what: "key" | "snippet") => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const test = async (kind: "benign" | "attack") => {
    setTesting(kind);
    try {
      const res = await sendTest({ orgId, kind } as never);
      setLastResult({ ...res, kind });
      toast(
        kind === "attack"
          ? `Attack pulse scored ${res.score}/100 — ${res.verdict}`
          : `Benign pulse scored ${res.score}/100 — ${res.verdict}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test event failed.");
    } finally {
      setTesting(null);
    }
  };

  if (overview === undefined) {
    return (
      <Card className="texture-paper border-border bg-card/85">
        <CardContent className="space-y-3 py-8">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (overview === null) {
    return (
      <Card className="texture-paper border-border bg-card/85">
        <CardContent className="py-8 text-center font-serif italic text-muted-foreground">
          This organization does not exist or you are not a member.
        </CardContent>
      </Card>
    );
  }

  const snippet = `curl -X POST ${ingestUrl} \\
  -H "Authorization: Bearer ${mintedKey ?? "sai_YOUR_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "user": "u_10293",
    "ts": ${Math.floor(Date.now() / 1000) * 1000},
    "ip": "203.0.113.9",
    "city": "Chennai",
    "country": "India",
    "device": "MacBook Pro",
    "browser": "Chrome 139",
    "fileDownloads": 12,
    "fileUploads": 1,
    "apiCalls": 640,
    "sensitiveResources": [],
    "privilegedActions": [],
    "authPassed": ["password", "otp"],
    "notes": ["login from web app"]
  }'`;

  return (
    <div className="space-y-6">
      {/* ── Org identity ─────────────────────────────────────────── */}
      <Card className="texture-paper deckle border-border bg-card/85">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-2xl">{overview.name}</CardTitle>
          <CardDescription className="font-mono text-xs uppercase tracking-widest">
            domain {overview.domain} · you are {overview.role}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1 font-mono text-[10px]">
            <Users className="size-3" /> {overview.members.length} member{overview.members.length === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className="gap-1 font-mono text-[10px]">
            <KeyRound className="size-3" /> {overview.keyCount} active key{overview.keyCount === 1 ? "" : "s"}
          </Badge>
        </CardContent>
      </Card>

      {/* ── Ingest key ───────────────────────────────────────────── */}
      {overview.role === "admin" && (
        <Card className="texture-paper border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-serif text-xl">
              <KeyRound className="size-4 text-primary" />
              Ingest API Key
            </CardTitle>
            <p className="font-serif text-sm text-muted-foreground">
              Wire your website or SSO to this endpoint. Keys are stored hashed and
              shown once.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {mintedKey ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-sm border border-border bg-background/70 px-3 py-2 font-mono text-xs">
                  {mintedKey}
                </code>
                <Button size="sm" variant="outline" onClick={() => copy(mintedKey, "key")}>
                  {copied === "key" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={mint} className="gap-2">
                <KeyRound className="size-3.5" />
                Mint new key
              </Button>
            )}

            <Separator />

            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Integration — POST {ingestUrl}
              </p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-sm border border-border bg-background/70 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
                  {snippet}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute right-2 top-2"
                  onClick={() => copy(snippet, "snippet")}
                >
                  {copied === "snippet" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                Response: {"{ ok, score, verdict, action }"} — act on
                <span className="text-primary"> action</span>:
                allow · monitor · challenge · block.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Live test ────────────────────────────────────────────── */}
      {overview.role === "admin" && (
        <Card className="texture-paper border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-serif text-xl">
              <Radio className="size-4 text-primary" />
              Live Test Console
            </CardTitle>
            <p className="font-serif text-sm text-muted-foreground">
              Fires a scripted event through the real scoring pipeline.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => test("benign")}
                disabled={testing !== null}
                className="gap-2"
              >
                {testing === "benign" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Send benign pulse
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => test("attack")}
                disabled={testing !== null}
                className="gap-2"
              >
                {testing === "attack" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Send attack pulse
              </Button>
            </div>
            {lastResult && (
              <div
                className={cn(
                  "rounded-sm border px-3 py-2 font-mono text-xs",
                  lastResult.kind === "attack"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-chart-1/40 bg-chart-1/10 text-chart-1",
                )}
              >
                {lastResult.kind === "attack" ? "Attack" : "Benign"} pulse → score{" "}
                <span className="font-bold">{lastResult.score}</span>/100 · verdict{" "}
                <span className="font-bold">{lastResult.verdict}</span>
                {lastResult.coldStart && (
                  <span className="block pt-1 text-[10px] uppercase tracking-widest opacity-80">
                    cold start — archive still thin, verdict capped at monitor
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Members ──────────────────────────────────────────────── */}
      <Card className="texture-paper border-border/70 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 font-serif text-xl">
            <Users className="size-4 text-primary" />
            Members
          </CardTitle>
          <p className="font-serif text-sm text-muted-foreground">
            Anyone with a matching email domain joining SentinelAI lands here as a
            member — redacted view.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/50">
            {overview.members.map((m) => (
              <li key={m.email} className="flex items-center justify-between py-2">
                <span className="font-mono text-xs text-foreground">{m.email}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-widest",
                    m.role === "admin" ? "border-primary/50 text-primary" : "text-muted-foreground",
                  )}
                >
                  {m.role}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
