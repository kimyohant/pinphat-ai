// ภาพย่อของเครื่องดนตรีแต่ละแบบ ใช้ในแถบเลือกเครื่อง วาดด้วยสีวัสดุจริง (ไม้ ทองเหลือง หนัง) จึงไม่เปลี่ยนตามโหมดสี
import type { PlayKind } from "./kit";

export function InstrumentGlyph({ kind, register = 0, size = 56 }: { kind: PlayKind; register?: number; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 64 64", "aria-hidden": true as const };
  if (kind === "bars") {
    const n = register < 0 ? 6 : 8;
    const w = register < 0 ? 7 : 5;
    return (
      <svg {...common}>
        <path d="M6 46 Q32 54 58 46" fill="none" stroke="#6b3d1d" strokeWidth="3" strokeLinecap="round" />
        {Array.from({ length: n }, (_, i) => {
          const h = (register < 0 ? 30 : 32) - i * (register < 0 ? 2.6 : 2.4);
          const x = 9 + i * ((46 - w) / (n - 1));
          return <rect key={i} x={x} y={44 - h} width={w} height={h} rx="1.6" fill={register < 0 ? "#7c4a25" : "#a86a37"} stroke="#4a2913" strokeWidth=".6" />;
        })}
      </svg>
    );
  }
  if (kind === "gongs") {
    return (
      <svg {...common}>
        <path d="M14 48 A22 22 0 1 1 50 48" fill="none" stroke="#6b3d1d" strokeWidth="3" strokeLinecap="round" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = ((150 + (i * 240) / 7) * Math.PI) / 180;
          const x = 32 + 18 * Math.cos(a);
          const y = 34 + 18 * Math.sin(a);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="5.2" fill="#c89843" stroke="#654410" strokeWidth=".6" />
              <circle cx={x} cy={y} r="2" fill="#f3dca8" />
            </g>
          );
        })}
      </svg>
    );
  }
  if (kind === "wind") {
    return (
      <svg {...common}>
        <path d="M8 30 L50 27 L56 24 L56 40 L50 37 L8 34 Z" fill="#8a5229" stroke="#4a2913" strokeWidth=".8" />
        <rect x="4" y="30" width="6" height="4" rx="1" fill="#d9c4a0" />
        {[16, 22, 28, 34, 40, 46].map((x) => (
          <circle key={x} cx={x} cy="32" r="1.8" fill="#2a1508" />
        ))}
        <path d="M14 30 L46 28" stroke="#f3dca8" strokeOpacity=".35" strokeWidth="1" />
      </svg>
    );
  }
  if (kind === "drum") {
    return (
      <svg {...common}>
        <ellipse cx="32" cy="20" rx="20" ry="7" fill="#e8d6b4" stroke="#6b3d1d" strokeWidth="1.2" />
        <path d="M12 20 L15 44 Q32 52 49 44 L52 20" fill="#9a3b26" stroke="#5c2414" strokeWidth="1.2" />
        <path d="M14 30 Q32 37 50 30" fill="none" stroke="#d9ad5e" strokeWidth="1.2" />
        <path d="M18 22 L22 46 M28 24 L29 49 M36 24 L35 49 M46 22 L42 46" stroke="#e8d6b4" strokeOpacity=".5" strokeWidth=".8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 38 Q20 24 32 38" fill="#c89843" stroke="#654410" strokeWidth="1" />
      <path d="M32 38 Q44 24 56 38" fill="#c89843" stroke="#654410" strokeWidth="1" />
      <circle cx="20" cy="31" r="2.2" fill="#f3dca8" />
      <circle cx="44" cy="31" r="2.2" fill="#f3dca8" />
      <path d="M20 29 Q32 14 44 29" fill="none" stroke="#c03a2b" strokeWidth="1.4" />
    </svg>
  );
}
