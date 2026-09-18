import { scoreColorHex } from "@/lib/sentinel/ui";

interface RiskDialProps {
  score: number;
  size?: number;
  label?: string;
}

/**
 * An antique pressure-gauge styled risk dial: aged brass ring, cream face,
 * serif numerals, and a needle pointing at the current risk score.
 */
export function RiskDial({ score, size = 220, label = "Risk Index" }: RiskDialProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const startAngle = -210; // degrees, dial runs -210° → +30°
  const endAngle = 30;
  const angle = startAngle + (clamped / 100) * (endAngle - startAngle);
  const cx = 100;
  const cy = 100;
  const r = 78;

  const polar = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const arcPath = (from: number, to: number, radius: number) => {
    const a = polar(from, radius);
    const b = polar(to, radius);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  const needle = polar(angle, r - 12);
  const needleTail = polar(angle + 180, 12);
  const color = scoreColorHex(clamped);

  const ticks = Array.from({ length: 11 }, (_, i) => startAngle + (i / 10) * (endAngle - startAngle));

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`Risk score ${clamped} of 100`}>
      <defs>
        <radialGradient id="dialFace" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#f4ecdb" />
          <stop offset="78%" stopColor="#e9dcc0" />
          <stop offset="100%" stopColor="#d8c5a0" />
        </radialGradient>
      </defs>

      {/* brass bezel */}
      <circle cx={cx} cy={cy} r={95} fill="#8a6f45" />
      <circle cx={cx} cy={cy} r={95} fill="none" stroke="#6e5734" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r={88} fill="url(#dialFace)" stroke="#6e5734" strokeWidth="1" />

      {/* colored risk band */}
      <path d={arcPath(-210, -81, r)} fill="none" stroke="#6b8f71" strokeWidth="7" strokeLinecap="butt" />
      <path d={arcPath(-80.5, -27, r)} fill="none" stroke="#b08d3e" strokeWidth="7" strokeLinecap="butt" />
      <path d={arcPath(-26.5, -3, r)} fill="none" stroke="#8a5a2b" strokeWidth="7" strokeLinecap="butt" />
      <path d={arcPath(-2.5, 30, r)} fill="none" stroke="#8e3b2f" strokeWidth="7" strokeLinecap="butt" />

      {/* ticks */}
      {ticks.map((deg, i) => {
        const outer = polar(deg, r - 2);
        const inner = polar(deg, r - (i % 5 === 0 ? 14 : 9));
        return (
          <line
            key={i}
            x1={outer.x} y1={outer.y}
            x2={inner.x} y2={inner.y}
            stroke="#5c4a2e"
            strokeWidth={i % 5 === 0 ? 2 : 1}
          />
        );
      })}
      {/* numerals */}
      {[0, 50, 100].map((n, i) => {
        const deg = startAngle + (n / 100) * (endAngle - startAngle);
        const p = polar(deg, r - 26);
        return (
          <text
            key={n}
            x={p.x} y={p.y + 4}
            textAnchor="middle"
            fontSize="11"
            fill="#5c4a2e"
            fontFamily="'Cormorant Garamond', Georgia, serif"
            fontWeight={600}
          >
            {i === 1 ? "50" : n}
          </text>
        );
      })}

      {/* needle */}
      <line x1={needleTail.x} y1={needleTail.y} x2={needle.x} y2={needle.y} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={7} fill="#5c4a2e" />
      <circle cx={cx} cy={cy} r={3} fill="#e9dcc0" />

      {/* score */}
      <text x={cx} y={cy + 44} textAnchor="middle" fontSize="30" fill={color} fontFamily="'Cormorant Garamond', Georgia, serif" fontWeight={700}>
        {clamped}
      </text>
      <text x={cx} y={cy + 60} textAnchor="middle" fontSize="9" fill="#7a6a4f" fontFamily="'Courier Prime', monospace" letterSpacing="2">
        {label.toUpperCase()} / 100
      </text>
    </svg>
  );
}
