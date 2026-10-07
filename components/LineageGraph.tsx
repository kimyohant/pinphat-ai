type P = { id: number; display_name: string; province: string | null };
type E = { teacher_id: number; student_id: number; note: string | null };

/** ผังสายการสืบทอดครู → ศิษย์ จัดชั้นตามรุ่น */
export function LineageGraph({ persons, edges, label = "ผังสายการสืบทอด" }: { persons: P[]; edges: E[]; label?: string }) {
  const gen = new Map<number, number>();
  const parents = new Map<number, number[]>();
  edges.forEach((e) => parents.set(e.student_id, [...(parents.get(e.student_id) ?? []), e.teacher_id]));
  const depth = (id: number, seen = new Set<number>()): number => {
    if (gen.has(id)) return gen.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(0, ...(parents.get(id) ?? []).map((p) => depth(p, seen) + 1));
    gen.set(id, d);
    return d;
  };
  persons.forEach((p) => depth(p.id));
  const levels: P[][] = [];
  persons.forEach((p) => (levels[gen.get(p.id)!] ??= []).push(p));
  const W = 760;
  const rowH = 96;
  const boxW = 168;
  const pos = new Map<number, { x: number; y: number }>();
  levels.forEach((row, li) => row.forEach((p, i) => pos.set(p.id, { x: ((i + 0.5) * W) / row.length, y: 34 + li * rowH })));
  const H = levels.length * rowH + 10;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 620, display: "block" }} role="img" aria-label={label}>
        {edges.map((e, i) => {
          const a = pos.get(e.teacher_id);
          const b = pos.get(e.student_id);
          if (!a || !b) return null;
          return <path key={i} d={`M ${a.x} ${a.y + 22} C ${a.x} ${a.y + 60}, ${b.x} ${b.y - 60}, ${b.x} ${b.y - 22}`} fill="none" stroke="var(--bronze)" strokeWidth="1.6" />;
        })}
        {persons.map((p) => {
          const c = pos.get(p.id)!;
          return (
            <g key={p.id}>
              <rect x={c.x - boxW / 2} y={c.y - 22} width={boxW} height={44} rx="10" fill="var(--surface)" stroke="var(--brand)" strokeOpacity="0.5" />
              <text x={c.x} y={c.y - 3} textAnchor="middle" fontSize="12.5" fill="var(--ink)" fontWeight="600">
                {p.display_name.replace(" (นามสมมติ)", "")}
              </text>
              <text x={c.x} y={c.y + 14} textAnchor="middle" fontSize="10.5" fill="var(--muted)">
                {p.province}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
