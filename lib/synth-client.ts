// เสียงสังเคราะห์ในเบราว์เซอร์ด้วย Web Audio (ระนาด + ฉิ่ง) ตรงกับเสียงที่ใช้สร้างไฟล์ตัวอย่างฝั่งเซิร์ฟเวอร์

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
