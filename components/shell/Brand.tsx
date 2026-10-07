// เครื่องหมายของระบบ: ฆ้องวงมองจากด้านบน ลูกฆ้องเรียงเป็นเกือกม้ารอบผู้บรรเลง
// 5 ลูกแรกเป็นทองเหลือง ที่เหลือเป็นเส้น เหมือนความรู้ที่ส่งต่อไปแล้วบางส่วนและยังต้องส่งต่ออีก

export function GongMark({ size = 32 }: { size?: number }) {
  const n = 8;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="gong-mark">
      <defs>
        <radialGradient id="pp-boss" cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="var(--bronze-200)" />
          <stop offset=".45" stopColor="var(--bronze-400)" />
          <stop offset="1" stopColor="var(--bronze-700)" />
        </radialGradient>
      </defs>
      {Array.from({ length: n }, (_, i) => {
        const a = ((140 + (i * 260) / (n - 1)) * Math.PI) / 180;
        const cx = 16 + 11.5 * Math.cos(a);
        const cy = 16 + 11.5 * Math.sin(a);
        const lit = i < 5;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={3.4} fill={lit ? "url(#pp-boss)" : "none"} stroke={lit ? "none" : "currentColor"} strokeOpacity={0.35} strokeWidth={1.2} />
            {lit && <circle cx={cx} cy={cy} r={1.1} fill="var(--bronze-800)" fillOpacity={0.55} />}
          </g>
        );
      })}
    </svg>
  );
}

export function Brand({ tagline }: { tagline: string }) {
  return (
    <span className="brand">
      <GongMark />
      <span className="brand-words">
        <b>Pinphat AI</b>
        <small>{tagline}</small>
      </span>
    </span>
  );
}
