// เสียงสังเคราะห์ในเบราว์เซอร์ด้วย Web Audio ของเครื่องในวง: ระนาดเอก ระนาดทุ้ม ฆ้อง ปี่ กลอง ฉิ่ง (ระนาดเอกกับฉิ่งตรงกับเสียงที่ใช้สร้างไฟล์ตัวอย่างฝั่งเซิร์ฟเวอร์)

let noiseBuf: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  noiseBuf = b;
  return b;
}

export function ranat(ctx: AudioContext, freq: number, when: number, gain = 0.32): void {
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(ctx.destination);
  const partial = (f: number, amp: number, decay: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, when + decay);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + decay + 0.05);
  };
  partial(freq, 1, 0.9);
  partial(freq * 3.93, 0.3, 0.2);
  const n = ctx.createBufferSource();
  const ng = ctx.createGain();
  n.buffer = noise(ctx);
  ng.gain.value = 0.25;
  n.connect(ng).connect(out);
  n.start(when);
}

/** เสียงฉิ่ง (เปิด) และฉับ (ปิด) ใช้นำจังหวะ */
export function ching(ctx: AudioContext, when: number, closed: boolean, gain = 0.12): void {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = 2650;
  o2.type = "sine";
  o2.frequency.value = 3920;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0005, when + (closed ? 0.07 : 0.5));
  o.connect(g);
  o2.connect(g);
  g.connect(ctx.destination);
  o.start(when);
  o2.start(when);
  o.stop(when + 0.6);
  o2.stop(when + 0.6);
}

/** ระนาดทุ้ม: ลูกกว้าง ไม้นวม เสียงต่ำ กลมกว่าและกังวานนานกว่าระนาดเอก */
export function ranatThum(ctx: AudioContext, freq: number, when: number, gain = 0.4): void {
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(ctx.destination);
  const partial = (f: number, amp: number, decay: number, type: OscillatorType = "sine") => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, when + decay);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + decay + 0.05);
  };
  partial(freq, 1, 1.4);
  partial(freq * 2.92, 0.12, 0.35);
}

/** ลูกฆ้อง: โลหะหล่อ ฮาร์มอนิกไม่ลงตัว มีเสียงกระพือจากความถี่ที่ห่างกันเล็กน้อย */
export function gong(ctx: AudioContext, freq: number, when: number, gain = 0.26): void {
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(ctx.destination);
  const partial = (f: number, amp: number, decay: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0006, when + decay);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + decay + 0.05);
  };
  partial(freq, 1, 2.2);
  partial(freq * 1.004, 0.6, 2.0);
  partial(freq * 2.01, 0.35, 1.2);
  partial(freq * 2.76, 0.22, 0.7);
  partial(freq * 5.4, 0.08, 0.25);
}

/** ปี่: ลิ้นสี่ใบ เสียงแหลมคม มีลูกคอ เสียงยาวตามความยาวช่อง */
export function pi(ctx: AudioContext, freq: number, when: number, dur = 0.45, gain = 0.16): void {
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.value = freq;
  lfo.frequency.value = 5.5;
  lfoGain.gain.value = freq * 0.012;
  lfo.connect(lfoGain).connect(o.frequency);
  filter.type = "lowpass";
  filter.frequency.value = Math.min(9000, freq * 6);
  filter.Q.value = 2;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.04);
  g.gain.setValueAtTime(gain, when + Math.max(0.06, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0006, when + dur);
  o.connect(filter).connect(g).connect(ctx.destination);
  o.start(when);
  lfo.start(when);
  o.stop(when + dur + 0.05);
  lfo.stop(when + dur + 0.05);
}

/** กลอง: ตุ๊บ (หน้าเปิด เสียงต่ำ ระดับเสียงตกลง) และ ป๊ะ (ตีปิด เสียงสั้นแหลม) */
export function drum(ctx: AudioContext, when: number, open: boolean, gain = 0.5): void {
  const g = ctx.createGain();
  g.connect(ctx.destination);
  if (open) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, when);
    o.frequency.exponentialRampToValueAtTime(62, when + 0.25);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, when + 0.5);
    o.connect(g);
    o.start(when);
    o.stop(when + 0.55);
    return;
  }
  const n = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.12);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  n.buffer = b;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 1.4;
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.frequency.value = 330;
  og.gain.setValueAtTime(gain * 0.5, when);
  og.gain.exponentialRampToValueAtTime(0.0008, when + 0.09);
  o.connect(og).connect(ctx.destination);
  g.gain.value = gain;
  n.connect(bp).connect(g);
  n.start(when);
  o.start(when);
  o.stop(when + 0.12);
}

/** เสียงนำจังหวะแบบไม้เคาะ ใช้แทนฉิ่งตอนฝึกฉิ่ง จะได้ไม่สับสนกับเสียงที่ผู้เรียนตีเอง */
export function click(ctx: AudioContext, when: number, strong: boolean, gain = 0.08): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = strong ? 1600 : 1100;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0005, when + 0.03);
  o.connect(g).connect(ctx.destination);
  o.start(when);
  o.stop(when + 0.05);
}
