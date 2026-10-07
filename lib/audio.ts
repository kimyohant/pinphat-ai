// งานเสียงฝั่งเซิร์ฟเวอร์: อ่าน/เขียน WAV, สังเคราะห์เสียงระนาด, วิเคราะห์ไฟล์บันทึก (ถอดโน้ต + วัดระบบเสียง)
import {
  NOTES,
  STEP_CENTS,
  DEFAULT_BASE_HZ,
  estimateBase,
  formatNotation,
  freqToNote,
  noteFreq,
  parseNotation,
  type NoteName,
} from "./notation";
import { detectOnsets, detectPitch, waveformPeaks } from "./pitch";

export function encodeWav(samples: Float32Array, sr: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** อ่าน WAV แบบ PCM 16/24/32-bit หรือ float32 รวมเป็นโมโน */
export function decodeWav(buf: Buffer): { sr: number; samples: Float32Array } | null {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let off = 12;
  let fmt: { format: number; channels: number; sr: number; bits: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sr: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
      if (fmt.format === 0xfffe && size >= 26) fmt.format = buf.readUInt16LE(body + 24);
    } else if (id === "data" && fmt) {
      const bytes = fmt.bits / 8;
      const end = Math.min(buf.length, body + size);
      const frames = Math.floor((end - body) / (bytes * fmt.channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const p = body + (i * fmt.channels + c) * bytes;
          if (fmt.format === 3 && fmt.bits === 32) s += buf.readFloatLE(p);
          else if (fmt.bits === 16) s += buf.readInt16LE(p) / 32768;
          else if (fmt.bits === 24) s += buf.readIntLE(p, 3) / 8388608;
          else if (fmt.bits === 32) s += buf.readInt32LE(p) / 2147483648;
          else if (fmt.bits === 8) s += (buf.readUInt8(p) - 128) / 128;
        }
        out[i] = s / fmt.channels;
      }
      return { sr: fmt.sr, samples: out };
    }
    off = body + size + (size % 2);
  }
  return null;
}

/** สังเคราะห์เสียงตีระนาด (เสียงหลัก + ฮาร์มอนิกไม่ลงตัวของลูกไม้ + เสียงกระทบสั้น ๆ) */
function strike(out: Float32Array, sr: number, t0: number, f: number, amp: number, seed: number) {
  const start = Math.floor(t0 * sr);
  const len = Math.min(out.length - start, Math.floor(sr * 0.9));
  let rnd = seed;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const attack = Math.min(1, t / 0.002);
    let v = Math.exp(-t / 0.22) * Math.sin(2 * Math.PI * f * t);
    v += 0.3 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * f * 3.93 * t);
    if (t < 0.006) {
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
      v += ((rnd / 0x7fffffff) * 2 - 1) * 0.25 * (1 - t / 0.006);
    }
    out[start + i] += amp * attack * v;
  }
}

export type SynthOptions = {
  baseHz?: number;
  devCents?: number[];
  slotSec: number;
  noise?: number;
  sr?: number;
  humanize?: number;
};

export function synthNotation(notation: string, opt: SynthOptions): Buffer {
  const sr = opt.sr ?? 22050;
  const slots = parseNotation(notation);
  const dur = slots.length * opt.slotSec + 1.2;
  const out = new Float32Array(Math.ceil(dur * sr));
  let seed = 7;
  slots.forEach((s) => {
    if (!s.note) return;
    seed = (seed * 48271) % 2147483647;
    const jitter = opt.humanize ? ((seed / 2147483647) * 2 - 1) * opt.humanize : 0;
    const f = noteFreq(s.note, s.octave, opt.baseHz ?? DEFAULT_BASE_HZ, opt.devCents);
    strike(out, sr, 0.4 + s.index * opt.slotSec + jitter, f, 0.42, seed);
  });
  if (opt.noise) {
    let r = 99;
    for (let i = 0; i < out.length; i++) {
      r = (r * 1103515245 + 12345) & 0x7fffffff;
      out[i] += ((r / 0x7fffffff) * 2 - 1) * opt.noise;
    }
  }
  return encodeWav(out, sr);
}

/** เสียงตีไล่ทีละลูกสำหรับวัดระบบเสียง */
export function synthTuningSweep(baseHz: number, devCents: number[], sr = 22050): Buffer {
  const out = new Float32Array(Math.ceil(sr * 8.6));
  NOTES.forEach((n, i) => strike(out, sr, 0.3 + i * 1.0, noteFreq(n, 0, baseHz, devCents), 0.45, i + 3));
  strike(out, sr, 0.3 + 7 * 1.0, noteFreq("ด", 1, baseHz, devCents), 0.45, 11);
  return encodeWav(out, sr);
}

export type DetectedNote = { t: number; hz: number; note: NoteName; octave: number; deviation: number; clarity: number };

export type Analysis = {
  durationSec: number;
  sampleRate: number;
  peaks: number[];
  onsets: number;
  notes: DetectedNote[];
  baseHz: number;
  slotSec: number | null;
  notation: string | null;
  confidence: number;
  tuning?: { baseHz: number; steps: { note: string; hz: number; cents: number; ideal: number; dev: number }[] };
};

/** ความยาวช่องจังหวะ = ระยะห่างที่สั้นที่สุดซึ่งพบซ้ำอย่างน้อย 2 ครั้ง (กันเสียงหลุดครั้งเดียว) */
function estimateSlot(iois: number[]): number {
  const s = [...iois].filter((x) => x > 0.08).sort((a, b) => a - b);
  for (const c of s) {
    const near = s.filter((x) => Math.abs(x - c) <= c * 0.15);
    if (near.length >= 2) return near.reduce((a, b) => a + b, 0) / near.length;
  }
  return s[Math.floor(s.length / 2)] ?? 0.4;
}

/** วิเคราะห์ไฟล์ WAV: หาโน้ตที่ตี ประมาณ ด ของวง จัดลงช่องจังหวะ และ (ถ้าเป็นการตีไล่เสียง) วัดระบบเสียง */
export function analyzeWav(buf: Buffer, contentType: string, baseGuess?: number): Analysis | null {
  const wav = decodeWav(buf);
  if (!wav) return null;
  const { sr, samples } = wav;
  const onsets = detectOnsets(samples, sr);
  const raw: { t: number; hz: number; clarity: number }[] = [];
  onsets.forEach((o, i) => {
    const from = o.sample + Math.floor(sr * 0.015);
    const nextStart = i + 1 < onsets.length ? onsets[i + 1].sample : samples.length;
    const len = Math.min(2048, Math.max(0, nextStart - from));
    if (len < 512) return;
    const p = detectPitch(samples.subarray(from, from + len), sr);
    if (p.f > 0) raw.push({ t: o.t, hz: p.f, clarity: p.clarity });
  });

  const base = contentType === "tuning" && raw.length ? raw[0].hz : estimateBase(raw.map((r) => r.hz), baseGuess ?? DEFAULT_BASE_HZ);
  const notes: DetectedNote[] = raw.map((r) => {
    const g = freqToNote(r.hz, base);
    return { t: r.t, hz: Math.round(r.hz * 10) / 10, note: g.note, octave: g.octave, deviation: Math.round(g.deviation), clarity: Math.round(r.clarity * 100) / 100 };
  });

  let confidence = notes.length
    ? notes.reduce((s, n) => s + n.clarity * Math.max(0, 1 - Math.abs(n.deviation) / (STEP_CENTS / 2)), 0) / notes.length
    : 0;

  // เสียงรบกวนพื้นหลังสูง (ระดับพลังงานช่วงเงียบเทียบกับช่วงดังที่สุด) ทำให้มีโอกาสพลาดโน้ต จึงลดความมั่นใจ
  const frameRms: number[] = [];
  for (let o = 0; o + 1024 <= samples.length; o += 1024) {
    let s = 0;
    for (let i = o; i < o + 1024; i++) s += samples[i] * samples[i];
    frameRms.push(Math.sqrt(s / 1024));
  }
  frameRms.sort((a, b) => a - b);
  const floorRatio = frameRms.length ? frameRms[Math.floor(frameRms.length * 0.1)] / (frameRms[frameRms.length - 1] || 1) : 0;
  confidence *= Math.min(1, Math.max(0.3, 1 - Math.max(0, floorRatio - 0.05) * 5));

  let slotSec: number | null = null;
  let notation: string | null = null;
  if (notes.length >= 2 && contentType !== "tuning") {
    const iois = notes.slice(1).map((n, i) => n.t - notes[i].t);
    slotSec = Math.max(0.12, estimateSlot(iois));
    const t0 = notes[0].t;
    // ปรับความยาวช่องด้วย least squares กันความคลาดสะสมเมื่อเพลงยาว
    for (let it = 0; it < 3; it++) {
      let num = 0;
      let den = 0;
      notes.forEach((n) => {
        const k = Math.round((n.t - t0) / slotSec!);
        num += k * (n.t - t0);
        den += k * k;
      });
      if (den > 0) slotSec = num / den;
    }
    const exact = notes.map((n) => (n.t - t0) / slotSec!);
    const rel = exact.map((x) => Math.round(x));
    // ลูกตกของเพลงลงจังหวะฉับ (ช่องสุดท้ายของห้อง) จึงเลื่อนให้โน้ตตัวสุดท้ายอยู่ช่องที่ 4
    const shift = (3 - (rel[rel.length - 1] % 4) + 4) % 4;
    const positions = rel.map((x) => x + shift);
    // จังหวะที่ไม่ลงช่องพอดี (เล่นไม่ตรงจังหวะหรือจับเสียงพลาด) ลดความมั่นใจลง
    const gridFit = exact.reduce((s, x) => s + Math.max(0, 1 - Math.abs(x - Math.round(x)) / 0.3), 0) / exact.length;
    confidence *= gridFit;
    const grid: { note: NoteName | null; octave: number }[] = Array.from({ length: positions[positions.length - 1] + 1 }, () => ({ note: null, octave: 0 }));
    notes.forEach((n, i) => (grid[positions[i]] = { note: n.note, octave: n.octave }));
    notation = formatNotation(grid);
  }

  let tuning: Analysis["tuning"];
  if (contentType === "tuning" && raw.length) {
    const f0 = raw[0].hz;
    tuning = {
      baseHz: Math.round(f0 * 10) / 10,
      steps: raw.slice(0, 8).map((r, i) => {
        const cents = Math.round(1200 * Math.log2(r.hz / f0));
        const ideal = Math.round(i * STEP_CENTS);
        return { note: i < 7 ? NOTES[i] : "ดํ", hz: Math.round(r.hz * 10) / 10, cents, ideal, dev: cents - ideal };
      }),
    };
  }

  return {
    durationSec: Math.round((samples.length / sr) * 100) / 100,
    sampleRate: sr,
    peaks: waveformPeaks(samples),
    onsets: onsets.length,
    notes,
    baseHz: Math.round(base * 10) / 10,
    slotSec: slotSec ? Math.round(slotSec * 1000) / 1000 : null,
    notation,
    confidence: Math.round(confidence * 100) / 100,
    tuning,
  };
}
