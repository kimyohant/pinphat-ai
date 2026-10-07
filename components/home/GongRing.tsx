// ภาพวาดฆ้องวงมองจากด้านบน: รางหวายโค้งเกือกม้า ลูกฆ้อง 16 ลูกเล็กลงตามระดับเสียง
// เป็นภาพวาดประกอบ ไม่ใช่ภาพถ่ายของวงจริง และมีป้ายบอกไว้ใต้ภาพเสมอ
// สีในภาพนี้เป็นสีของวัสดุจริง (ทองเหลือง หวาย ไม้) ไม่เปลี่ยนตามโหมดสี จึงเขียนค่าสีตรง ๆ ได้ในไฟล์นี้ไฟล์เดียว

const N = 16;
const START = 128; // องศา เริ่มทางซ้ายล่าง
const SWEEP = 284; // เว้นช่องด้านล่างให้ผู้บรรเลงนั่ง

export function GongRing({ caption }: { caption: string }) {
  const cx = 200;
  const cy = 196;
  const R = 138;
  const gongs = Array.from({ length: N }, (_, i) => {
    const a = ((START + (i * SWEEP) / (N - 1)) * Math.PI) / 180;
    // ลูกเสียงต่ำใหญ่กว่า ไล่เล็กลงไปทางเสียงสูง
    const r = 23 - i * 0.62;
    return { i, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), r };
  });
  const arc = (rad: number) => {
    const a0 = ((START - 9) * Math.PI) / 180;
    const a1 = ((START + SWEEP + 9) * Math.PI) / 180;
    const x0 = cx + rad * Math.cos(a0);
    const y0 = cy + rad * Math.sin(a0);
    const x1 = cx + rad * Math.cos(a1);
    const y1 = cy + rad * Math.sin(a1);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${rad} ${rad} 0 1 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };

  return (
    <figure className="hero-art">
      <svg viewBox="0 0 400 400" role="img" aria-label={caption} className="gong-ring">
        <defs>
          <radialGradient id="gr-rim" cx="36%" cy="30%" r="78%">
            <stop offset="0" stopColor="#f6e2b4" />
            <stop offset=".35" stopColor="#d8ae5e" />
            <stop offset=".75" stopColor="#a6741e" />
            <stop offset="1" stopColor="#5f400f" />
          </radialGradient>
          <radialGradient id="gr-boss" cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#fff3d4" />
            <stop offset=".4" stopColor="#e2bd72" />
            <stop offset="1" stopColor="#8a5f14" />
          </radialGradient>
          <linearGradient id="gr-rattan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9a6233" />
            <stop offset=".5" stopColor="#6b3d1d" />
            <stop offset="1" stopColor="#4a2913" />
          </linearGradient>
          <radialGradient id="gr-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#dab46a" stopOpacity=".28" />
            <stop offset="1" stopColor="#dab46a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={186} fill="url(#gr-glow)" />
        {/* รางหวายสองเส้น */}
        <path d={arc(R + 30)} fill="none" stroke="url(#gr-rattan)" strokeWidth={9} strokeLinecap="round" />
        <path d={arc(R - 30)} fill="none" stroke="url(#gr-rattan)" strokeWidth={7} strokeLinecap="round" />
        {/* ซี่ค้ำระหว่างราง */}
        {gongs.map((g) => {
          const a = Math.atan2(g.y - cy, g.x - cx);
          return (
            <line
              key={`s${g.i}`}
              x1={cx + (R - 30) * Math.cos(a)}
              y1={cy + (R - 30) * Math.sin(a)}
              x2={cx + (R + 30) * Math.cos(a)}
              y2={cy + (R + 30) * Math.sin(a)}
              stroke="#4a2913"
              strokeOpacity={0.55}
              strokeWidth={2}
            />
          );
        })}
        {gongs.map((g) => (
          <g key={g.i} className={`g${g.i < 5 ? " strike" : ""}`} style={{ "--i": g.i } as React.CSSProperties}>
            <circle cx={g.x} cy={g.y + 3} r={g.r} fill="#05081a" opacity={0.35} />
            <circle cx={g.x} cy={g.y} r={g.r} fill="url(#gr-rim)" />
            <circle cx={g.x} cy={g.y} r={g.r * 0.68} fill="none" stroke="#5f400f" strokeOpacity={0.45} strokeWidth={1.2} />
            <circle cx={g.x} cy={g.y} r={g.r * 0.42} fill="url(#gr-boss)" />
            <ellipse cx={g.x - g.r * 0.14} cy={g.y - g.r * 0.17} rx={g.r * 0.15} ry={g.r * 0.09} fill="#fffaf0" opacity={0.75} />
          </g>
        ))}
        {/* ไม้ตีฆ้องคู่ วางไว้ที่ช่องผู้บรรเลง */}
        <g opacity={0.92}>
          <line x1={168} y1={318} x2={196} y2={268} stroke="#d9c4a0" strokeWidth={4} strokeLinecap="round" />
          <circle cx={198} cy={264} r={9} fill="#3a2a1c" />
          <line x1={232} y1={318} x2={208} y2={270} stroke="#d9c4a0" strokeWidth={4} strokeLinecap="round" />
          <circle cx={206} cy={266} r={9} fill="#3a2a1c" />
        </g>
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
