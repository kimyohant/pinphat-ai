import Link from "next/link";
import { PROVINCE_LAYOUT } from "@/lib/archive";

// แผนผัง 8 จังหวัดอีสานตอนบน จุดใหญ่ตามจำนวนครู เส้นโค้งด้านบนและด้านขวาคือแม่น้ำโขง
// ตำแหน่งจัดวางโดยประมาณ ไม่ใช่แผนที่ตามมาตราส่วน และมีป้ายบอกไว้ใต้ภาพเสมอ
export function ProvinceMap({ counts, selected, locale, mekong, note, title }: { counts: Record<string, number>; selected?: string; locale: string; mekong: string; note: string; title: string }) {
  const max = Math.max(1, ...Object.values(counts));
  const label = (th: string) => (locale === "en" ? PROVINCE_LAYOUT[th].en : locale === "lo" ? PROVINCE_LAYOUT[th].lo : th);
  return (
    <figure className="pmap">
      <svg viewBox="0 0 100 80" role="img" aria-label={title}>
        <defs>
          <radialGradient id="pm-dot" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="var(--bronze-100)" />
            <stop offset=".5" stopColor="var(--bronze-400)" />
            <stop offset="1" stopColor="var(--bronze-700)" />
          </radialGradient>
          <linearGradient id="pm-river" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--indigo-300)" stopOpacity=".2" />
            <stop offset=".5" stopColor="var(--indigo-300)" stopOpacity=".75" />
            <stop offset="1" stopColor="var(--indigo-300)" stopOpacity=".3" />
          </linearGradient>
        </defs>
        <path className="pm-river" d="M 2 34 C 14 20, 30 12, 44 15 S 64 4, 78 9 S 95 24, 94 40 S 91 62, 97 78" stroke="url(#pm-river)" />
        <text className="pm-river-label" x="58" y="7.5">
          {mekong}
        </text>
        {Object.entries(PROVINCE_LAYOUT).map(([th, p]) => {
          const n = counts[th] ?? 0;
          const r = 2.2 + (n / max) * 2.8;
          const y = p.y * 0.8;
          const on = selected === th;
          return (
            <Link key={th} href={on ? "/archive" : `/archive?prov=${encodeURIComponent(th)}`} scroll={false} className={`pm-node${on ? " on" : ""}${n ? "" : " empty"}`} aria-label={`${label(th)} ${n}`}>
              <circle className="pm-halo" cx={p.x} cy={y} r={r + 3.2} />
              <circle className="pm-dot" cx={p.x} cy={y} r={r} fill="url(#pm-dot)" />
              <text className="pm-n" x={p.x} y={y + 0.9}>
                {n}
              </text>
              <text className="pm-label" x={p.x} y={y + r + 4.4}>
                {label(th)}
              </text>
            </Link>
          );
        })}
      </svg>
      <figcaption>{note}</figcaption>
    </figure>
  );
}
