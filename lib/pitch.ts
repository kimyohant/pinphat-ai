// ตรวจจับจุดเริ่มเสียงและระดับเสียง ใช้ร่วมกันทั้งการวิเคราะห์ไฟล์บนเซิร์ฟเวอร์และโค้ชฝึกซ้อมในเบราว์เซอร์

/** ระดับเสียงแบบ McLeod (NSDF) คืนค่าความถี่และความชัด 0–1 */
export function detectPitch(x: Float32Array, sr: number, minHz = 120, maxHz = 1400): { f: number; clarity: number } {
  const n = x.length;
  const minLag = Math.max(2, Math.floor(sr / maxHz));
  const maxLag = Math.min(n - 2, Math.floor(sr / minHz));
  if (maxLag <= minLag + 2) return { f: 0, clarity: 0 };
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let ac = 0;
    let m = 0;
    for (let i = 0; i < n - lag; i++) {
      ac += x[i] * x[i + lag];
      m += x[i] * x[i] + x[i + lag] * x[i + lag];
    }
    nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
  }
  let max = 0;
  for (let l = minLag; l <= maxLag; l++) if (nsdf[l] > max) max = nsdf[l];
  if (max < 0.3) return { f: 0, clarity: max };
  for (let l = minLag; l <= maxLag; l++) {
    if (nsdf[l] >= 0.9 * max && nsdf[l] >= nsdf[l - 1] && nsdf[l] >= nsdf[l + 1]) {
      const a = nsdf[l - 1];
      const b = nsdf[l];
      const c = nsdf[l + 1];
      const den = a - 2 * b + c;
      const p = den !== 0 ? (0.5 * (a - c)) / den : 0;
      return { f: sr / (l + p), clarity: b };
    }
  }
  return { f: 0, clarity: 0 };
}

export type Onset = { t: number; sample: number };

/** หาจุดเริ่มเสียงจากพลังงานที่เพิ่มขึ้นอย่างรวดเร็ว */
export function detectOnsets(x: Float32Array, sr: number, hop = 256, minGapSec = 0.07): Onset[] {
  const win = hop * 2;
  const frames = Math.max(0, Math.floor((x.length - win) / hop));
  const rms = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const o = f * hop;
    for (let i = 0; i < win; i++) s += x[o + i] * x[o + i];
    rms[f] = Math.sqrt(s / win);
    if (rms[f] > peak) peak = rms[f];
  }
  const thr = Math.max(0.01, peak * 0.12);
  const minGap = Math.round((minGapSec * sr) / hop);
  const out: Onset[] = [];
  let last = -minGap;
  // ใช้ผลต่างพลังงานแบบลอการิทึม เสียงที่ตีติดกันขณะเสียงเดิมยังก้องอยู่จึงยังจับได้
  const lg = Array.from(rms, (v) => Math.log(v + 1e-4));
  for (let f = 2; f < frames - 1; f++) {
    const rise = lg[f] - Math.min(lg[f - 1], lg[f - 2]);
    if (rms[f] > thr && rise > 0.22 && lg[f + 1] - lg[f] < rise && f - last >= minGap) {
      out.push({ t: (f * hop) / sr, sample: f * hop });
      last = f;
    }
  }
  return out;
}

/** จุดสูงสุดของคลื่นเสียงสำหรับวาดรูป */
export function waveformPeaks(x: Float32Array, buckets = 160): number[] {
  const out: number[] = [];
  const size = Math.max(1, Math.floor(x.length / buckets));
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    for (let i = b * size; i < Math.min(x.length, (b + 1) * size); i++) {
      const v = Math.abs(x[i]);
      if (v > m) m = v;
    }
    out.push(Math.round(m * 1000) / 1000);
  }
  return out;
}
