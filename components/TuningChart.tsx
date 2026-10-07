type Step = { note: string; hz: number; cents: number; ideal: number; dev: number };

/** ค่าเพี้ยนของแต่ละเสียงเทียบกับระบบ 7 เสียงเท่า (หน่วย cents) */
export function TuningChart({ steps, title }: { steps: Step[]; title?: string }) {
  const W = 520;
  const H = 190;
  const pad = { l: 44, r: 12, t: 16, b: 34 };
  const lim = 30;
  const x = (i: number) => pad.l + ((i + 0.5) * (W - pad.l - pad.r)) / steps.length;
  const y = (d: number) => pad.t + ((lim - Math.max(-lim, Math.min(lim, d))) * (H - pad.t - pad.b)) / (2 * lim);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 360, display: "block" }} role="img" aria-label={title ?? "ค่าเพี้ยนของระบบเสียง"}>
        {[-30, -15, 0, 15, 30].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="var(--f-mono), monospace">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {steps.map((s, i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(0)} y2={y(s.dev)} stroke={Math.abs(s.dev) > 10 ? "var(--bronze)" : "var(--indigo)"} strokeWidth="10" strokeLinecap="round" />
            <text x={x(i)} y={s.dev >= 0 ? y(s.dev) - 9 : y(s.dev) + 17} textAnchor="middle" fontSize="11" fill="var(--ink)" fontFamily="var(--f-mono), monospace">
              {s.dev > 0 ? `+${s.dev}` : s.dev}
            </text>
            <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="14" fill="var(--ink)">
              {s.note}
            </text>
          </g>
        ))}
        <text x={pad.l} y={11} fontSize="10" fill="var(--muted)">cents เทียบ 7 เสียงเท่า</text>
      </svg>
    </div>
  );
}
