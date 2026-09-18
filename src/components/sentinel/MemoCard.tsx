import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Bot, FileText, RefreshCw } from "lucide-react";

interface MemoCardProps {
  memo: string | null;
  memoState?: "pending" | "ready" | "failed";
  onSummon: () => Promise<string>;
}

/**
 * The LLM Security Analyst card: converts the technical dossier into a
 * plain-language incident memo, typed onto an archival index card.
 */
export function MemoCard({ memo, memoState, onSummon }: MemoCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const summon = async () => {
    setBusy(true);
    setDraft(null);
    try {
      const text = await onSummon();
      setDraft(text);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `The analyst is unavailable: ${err.message}`
          : "The analyst is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const text = draft ?? memo;

  return (
    <Card className="texture-paper deckle border-border bg-card/85">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <Bot className="size-4 text-primary" />
          AI Security Analyst — Incident Memo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {text ? (
          <blockquote className="border-l-2 border-primary/50 bg-background/50 px-4 py-3 font-serif text-base italic leading-7 text-foreground">
            “{text}”
          </blockquote>
        ) : memoState === "pending" || busy ? (
          <p className="flex items-center gap-2 font-serif text-sm italic text-muted-foreground">
            <Spinner className="size-4" />
            The analyst is reviewing the dossier…
          </p>
        ) : (
          <p className="font-serif text-sm italic text-muted-foreground">
            No memo on file yet for this session.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {memoState === "ready" && !draft
              ? "Filed · gpt-4o-mini"
              : memoState === "failed"
                ? "Last attempt failed"
                : "Plain-language narration of the evidence"}
          </p>
          <Button size="sm" onClick={summon} disabled={busy} className="gap-2">
            {busy ? (
              <Spinner className="size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {memo ? "Re-summon analyst" : "Summon analyst"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
