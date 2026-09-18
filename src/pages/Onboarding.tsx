import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowRight, Building2, KeyRound, Loader2, ShieldCheck } from "lucide-react";

interface OrgLite {
  orgId: string;
  name: string;
  domain: string;
  role: "admin" | "member";
}

/**
 * Onboarding: claim a domain for your organization using your work email.
 * The creator becomes the domain admin; colleagues on the same email domain
 * automatically join the existing org as members.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const myOrgs = useQuery(api.orgs.listMyOrgs) as OrgLite[] | undefined;
  const createOrg = useMutation(api.orgs.createOrg);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (myOrgs && myOrgs.length > 0) {
      navigate(`/dashboard?org=${encodeURIComponent(myOrgs[0]!.orgId)}`, { replace: true });
    }
  }, [myOrgs, navigate]);

  const claim = async () => {
    setBusy(true);
    try {
      const res = await createOrg({ name: name.trim() });
      toast(
        res.joined
          ? "Joined your organization's existing SentinelAI workspace"
          : "Domain claimed — you are the admin",
      );
      navigate(`/dashboard?org=${encodeURIComponent(res.orgId)}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim the domain.");
      setBusy(false);
    }
  };

  return (
    <div className="texture-paper vignette flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <Card className="texture-paper deckle border-border bg-card/90 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-sm border-2 border-primary/50 bg-primary/10">
              <Building2 className="size-5 text-primary" />
            </div>
            <CardTitle className="font-serif text-2xl">Claim Your Domain</CardTitle>
            <p className="font-serif text-sm italic text-muted-foreground">
              SentinelAI watches the behavior of your users — per organization, per domain.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {myOrgs === undefined ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            ) : (
              <>
                <div className="rounded-sm border border-border/60 bg-background/50 px-3 py-2 font-mono text-xs text-muted-foreground">
                  <p>
                    <span className="text-primary">Your email domain:</span>{" "}
                    {deriveDomainHint()}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest">
                    Colleagues with the same domain will join this org automatically.
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Organization name (optional)
                  </span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Corporation"
                  />
                </label>

                <Button
                  onClick={claim}
                  disabled={busy}
                  className="h-11 w-full gap-2 text-base"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  Claim domain & open the Watch Room
                  <ArrowRight className="size-4" />
                </Button>

                <div className="flex items-start gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                  <KeyRound className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
                  <p>
                    After claiming, you (as admin) can mint an ingest API key and wire
                    your website's login/session events to the SentinelAI endpoint.
                    Only domain admins see full session detail — IPs, devices, resources.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <button
          onClick={() => navigate("/")}
          className={cn(
            "mx-auto mt-4 block font-mono text-[10px] uppercase tracking-widest",
            "text-muted-foreground transition-colors hover:text-primary",
          )}
        >
          ← Back to the Bureau
        </button>
      </motion.div>
    </div>
  );
}

function deriveDomainHint(): string {
  // The actual domain is derived server-side from the signed-in email.
  return "derived from your signed-in email";
}
