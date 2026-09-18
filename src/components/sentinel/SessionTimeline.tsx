import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtArchiveShort, scoreColorHex } from "@/lib/sentinel/ui";
import type { Verdict } from "@/lib/sentinel/types";

interface SessionSummary {
  sessionId: string;
  user: string;
  ts: number;
  score: number;
  verdict: Verdict;
  downloads: number;
  city: string;
  attackStory: boolean;
}

/**
 * File-download volume over the archive window, per selected user's
 * perspective: their own sessions plus the incident, with the normal
 * ceiling drawn as a dashed rule — the visual "spike" moment of the demo.
 */
export function SessionTimeline({
  sessions,
  selectedUser,
  ceiling,
}: {
  sessions: SessionSummary[];
  selectedUser: string;
  ceiling: number;
}) {
  const data = sessions
    .filter((s) => s.user === selectedUser)
    .sort((a, b) => a.ts - b.ts)
    .map((s) => ({
      ts: s.ts,
      label: fmtArchiveShort(s.ts),
      downloads: s.downloads,
      score: s.score,
      color: scoreColorHex(s.score),
      incident: s.attackStory,
    }));

  return (
    <Card className="texture-paper border-border/70 bg-card/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <TrendingUp className="size-4 text-primary" />
          File Downloads vs Normal Ceiling — {selectedUser}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8a5a2b" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#8a5a2b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(92,74,46,0.15)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "#7a6a4f", fontFamily: "'Courier Prime', monospace" }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#7a6a4f", fontFamily: "'Courier Prime', monospace" }}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#f4ecdb",
                  border: "1px solid #c9b88f",
                  fontFamily: "'EB Garamond', serif",
                  fontSize: 12,
                }}
              />
              <ReferenceLine
                y={ceiling}
                stroke="#8e3b2f"
                strokeDasharray="6 3"
                label={{
                  value: "normal ceiling",
                  position: "insideTopRight",
                  fontSize: 9,
                  fill: "#8e3b2f",
                  fontFamily: "'Courier Prime', monospace",
                }}
              />
              <Area
                type="monotone"
                dataKey="downloads"
                stroke="#8a5a2b"
                strokeWidth={2}
                fill="url(#dlFill)"
                dot={(props: {
                  cx?: number;
                  cy?: number;
                  index?: number;
                  payload?: { ts: number; color: string; incident: boolean };
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
