import { initialOf, shortName, type PersonRow } from "@/lib/archive";

// สายการสืบทอดแบบกลุ่มดาว: ครูอยู่แถวบน ศิษย์แต่ละรุ่นเรียงลงมา เส้นทองโค้งจากครูสู่ศิษย์
export function Constellation({ persons, edges, label }: { persons: PersonRow[]; edges: { teacher_id: number; student_id: number }[]; label: string }) {
  const parents = new Map<number, number[]>();
  edges.forEach((e) => parents.set(e.student_id, [...(parents.get(e.student_id) ?? []), e.teacher_id]));
  const gen = new Map<number, number>();
  const depth = (id: number, seen = new Set<number>()): number => {
    if (gen.has(id)) return gen.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(0, ...(parents.get(id) ?? []).map((p) => depth(p, seen) + 1));
    gen.set(id, d);
    return d;
  };
  persons.forEach((p) => depth(p.id));
  const rows: PersonRow[][] = [];
  persons.forEach((p) => (rows[gen.get(p.id)!] ??= []).push(p));
  // เรียงแต่ละแถวตามตำแหน่งเฉลี่ยของครู เส้นจะไขว้กันน้อยลง
  const pos = new Map<number, { x: number; y: number }>();
  const W = Math.max(720, Math.max(...rows.map((r) => r.length)) * 128);
  const rowH = 118;
  rows.forEach((row, li) => {
    if (li > 0) {
      const avg = (p: PersonRow) => {
        const ps = (parents.get(p.id) ?? []).map((t) => pos.get(t)?.x ?? W / 2);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : W / 2;
      };
      row.sort((a, b) => avg(a) - avg(b));
    }
    row.forEach((p, i) => pos.set(p.id, { x: ((i + 0.5) * W) / row.length, y: 46 + li * rowH }));
  });
  const H = rows.length * rowH + 30;

  return (
    <div className="constellation">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
        <defs>
          <radialGradient id="cs-master" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="var(--bronze-100)" />
            <stop offset=".55" stopColor="var(--bronze-400)" />
            <stop offset="1" stopColor="var(--bronze-700)" />
          </radialGradient>
        </defs>
        {edges.map((e, i) => {
          const a = pos.get(e.teacher_id);
          const b = pos.get(e.student_id);
          if (!a || !b) return null;
          return <path key={i} className="cs-edge" d={`M ${a.x} ${a.y + 60} C ${a.x} ${a.y + 84}, ${b.x} ${b.y - 50}, ${b.x} ${b.y - 24}`} />;
        })}
        {persons.map((p) => {
          const c = pos.get(p.id)!;
          const master = p.role === "master";
          return (
            <a key={p.id} href={`/archive/person/${p.id}`} className={`cs-node${master ? " master" : ""}`}>
              <circle className="cs-halo" cx={c.x} cy={c.y} r={28} />
              <circle className="cs-dot" cx={c.x} cy={c.y} r={19} fill={master ? "url(#cs-master)" : undefined} />
              <text className="cs-initial" x={c.x} y={c.y + 5}>
                {initialOf(p.display_name)}
              </text>
              <text className="cs-name" x={c.x} y={c.y + 38}>
                {shortName(p.display_name)}
              </text>
              <text className="cs-prov" x={c.x} y={c.y + 52}>
                {p.province}
              </text>
            </a>
          );
        })}
      </svg>
    </div>
  );
}
