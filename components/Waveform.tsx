/** รูปคลื่นเสียงจากค่าสูงสุดที่วิเคราะห์ไว้ พร้อมไฮไลต์ช่วงของส่วนย่อย */
export function Waveform({ peaks, from = 0, to = 0 }: { peaks: number[]; from?: number; to?: number }) {
  const n = peaks.length || 1;
  const max = Math.max(0.05, ...peaks);
  return (
    <svg className="wave" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" role="img" aria-label="รูปคลื่นเสียง">
      <rect x="0" y="0" width={n} height="100" fill="var(--sunk)" />
      {to > from && <rect x={from * n} y="0" width={(to - from) * n} height="100" fill="var(--bronze-soft)" />}
      {peaks.map((p, i) => {
        const h = Math.max(1, (p / max) * 92);
        const inSeg = to > from && i / n >= from && i / n <= to;
        return <rect key={i} x={i + 0.15} y={50 - h / 2} width={0.7} height={h} fill={inSeg ? "var(--bronze)" : "var(--indigo)"} opacity={inSeg ? 1 : 0.55} />;
      })}
    </svg>
  );
}
