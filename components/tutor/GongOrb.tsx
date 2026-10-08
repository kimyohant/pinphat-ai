// วงฆ้อง 16 ลูกที่บอกสถานะของครู AI ตามขั้นจริงที่เซิร์ฟเวอร์ส่งมา ไม่ใช่แอนิเมชันประดับ
// idle หายใจช้า · typing สว่างขึ้นเมื่อมีคนพิมพ์ · searching แสงวิ่งรอบวงระหว่างค้นคลัง
// found ลูกฆ้องติดตามจำนวนแหล่งที่มาที่พบ · speaking คลื่นเสียงแผ่จากกลางวงขณะตอบ
// สีในภาพเป็นสีวัสดุจริง (ทองเหลือง หวาย) ไม่เปลี่ยนตามโหมดสี จึงเขียนค่าสีในไฟล์นี้ได้

export type OrbState = "idle" | "typing" | "searching" | "found" | "speaking" | "empty";

const N = 16;

export function GongOrb({ state, lit = 0, size = 280, label }: { state: OrbState; lit?: number; size?: number; label?: string }) {
  const c = 100;
  const R = 74;
  const gongs = Array.from({ length: N }, (_, i) => {
    // เริ่มจากด้านบน เวียนตามเข็มนาฬิกา ให้แสงวิ่งอ่านง่าย
    const a = ((-90 + (i * 360) / N) * Math.PI) / 180;
    return { i, x: c + R * Math.cos(a), y: c + R * Math.sin(a), r: 9.2 - (i % 4) * 0.35 };
  });
  // แหล่งที่มา 1 ชิ้นจุดฆ้อง 2 ลูก เพื่อให้เห็นความต่างได้แม้มีแหล่งที่มาน้อย
  const litCount = state === "found" || state === "speaking" ? Math.min(N, Math.max(lit * 2, lit ? 2 : 0)) : 0;

  return (
    <div className="orb" data-state={state} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <radialGradient id="orb-core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff4d6" stopOpacity=".95" />
            <stop offset=".22" stopColor="#e7c27a" stopOpacity=".75" />
            <stop offset=".55" stopColor="#3e4fa3" stopOpacity=".35" />
            <stop offset="1" stopColor="#10152c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orb-rim" cx="36%" cy="30%" r="80%">
            <stop offset="0" stopColor="#f6e2b4" />
            <stop offset=".4" stopColor="#d2a456" />
            <stop offset="1" stopColor="#5f400f" />
          </radialGradient>
          <radialGradient id="orb-boss" cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#fff6dc" />
            <stop offset="1" stopColor="#9a6b1c" />
          </radialGradient>
        </defs>

        {/* คลื่นเสียงที่แผ่ออกเมื่อครู AI กำลังตอบ */}
        <g className="orb-ripples">
          <circle cx={c} cy={c} r={30} />
          <circle cx={c} cy={c} r={30} />
          <circle cx={c} cy={c} r={30} />
        </g>
        {/* วงโคจรบาง ๆ สองชั้น หมุนสวนทางกัน */}
        <circle className="orb-orbit a" cx={c} cy={c} r={R + 15} />
        <circle className="orb-orbit b" cx={c} cy={c} r={R - 16} />
        <circle className="orb-core" cx={c} cy={c} r={46} fill="url(#orb-core)" />

        {gongs.map((g) => (
          <g key={g.i} className={`orb-g${g.i < litCount ? " lit" : ""}`} style={{ "--i": g.i } as React.CSSProperties}>
            <circle cx={g.x} cy={g.y} r={g.r} fill="url(#orb-rim)" />
            <circle cx={g.x} cy={g.y} r={g.r * 0.62} fill="none" stroke="#5f400f" strokeOpacity={0.5} strokeWidth={0.8} />
            <circle cx={g.x} cy={g.y} r={g.r * 0.38} fill="url(#orb-boss)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
