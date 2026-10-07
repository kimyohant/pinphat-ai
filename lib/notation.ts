// โน้ตตัวเลขไทย + ระบบเสียง 7 เสียง ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์

export const NOTES = ["ด", "ร", "ม", "ฟ", "ซ", "ล", "ท"] as const;
export type NoteName = (typeof NOTES)[number];

/** ระยะห่างระหว่างเสียงในระบบ 7 เสียงเท่า (ค่าทฤษฎี) */
export const STEP_CENTS = 1200 / 7;
export const DEFAULT_BASE_HZ = 280;

const HIGH = "ํ"; // นิคหิต ใช้แทนจุดบน = เสียงสูง
const LOW = "ฺ"; // พินทุ ใช้แทนจุดล่าง = เสียงต่ำ

export type Slot = {
  index: number;
  bar: number;
  pos: number;
  note: NoteName | null;
  octave: number;
};

export function isNote(ch: string): ch is NoteName {
  return (NOTES as readonly string[]).includes(ch);
}

/** แปลงข้อความโน้ต เช่น "- ด - ร | - ม - ซ" เป็นลำดับช่องจังหวะ */
export function parseNotation(src: string): Slot[] {
  const slots: Slot[] = [];
  const bars = src
    .split("|")
    .map((b) => b.trim())
    .filter(Boolean);
  let index = 0;
  bars.forEach((bar, bi) => {
    bar
      .split(/\s+/)
      .filter(Boolean)
      .forEach((tok, pi) => {
        let note: NoteName | null = null;
        let octave = 0;
        if (tok !== "-" && isNote(tok[0])) {
          note = tok[0];
          if (tok.includes(HIGH)) octave = 1;
          if (tok.includes(LOW)) octave = -1;
        }
        slots.push({ index: index++, bar: bi, pos: pi, note, octave });
      });
  });
  return slots;
}

export function noteLabel(note: NoteName | null, octave = 0): string {
  if (!note) return "-";
  return note + (octave > 0 ? HIGH : octave < 0 ? LOW : "");
}

export function formatNotation(
  items: { note: NoteName | null; octave: number }[],
  perBar = 4,
): string {
  const toks = items.map((s) => noteLabel(s.note, s.octave));
  while (toks.length % perBar !== 0) toks.push("-");
  const bars: string[] = [];
  for (let i = 0; i < toks.length; i += perBar) bars.push(toks.slice(i, i + perBar).join(" "));
  return bars.join(" | ");
}

export function barCount(slots: Slot[]): number {
  return slots.length ? slots[slots.length - 1].bar + 1 : 0;
}

/** ความถี่ของโน้ต โดยใช้ ด ของวงเป็นฐาน และค่าเพี้ยนรายเสียง (cents) ถ้ามี */
export function noteFreq(note: NoteName, octave: number, baseHz = DEFAULT_BASE_HZ, devCents?: number[]): number {
  const i = NOTES.indexOf(note);
  const cents = i * STEP_CENTS + (devCents?.[i] ?? 0) + 1200 * octave;
  return baseHz * Math.pow(2, cents / 1200);
}

export type PitchGuess = { note: NoteName; octave: number; cents: number; deviation: number };

/** หาโน้ตที่ใกล้ที่สุดจากความถี่ */
export function freqToNote(freq: number, baseHz = DEFAULT_BASE_HZ): PitchGuess {
  const cents = 1200 * Math.log2(freq / baseHz);
  const step = Math.round(cents / STEP_CENTS);
  const deviation = cents - step * STEP_CENTS;
  const octave = Math.floor(step / 7);
  const idx = ((step % 7) + 7) % 7;
  return { note: NOTES[idx], octave, cents, deviation };
}

/** ประมาณ ด ของวงจากชุดความถี่ (ค่าเฉลี่ยเชิงวงกลมของเศษ cents) */
export function estimateBase(freqs: number[], guess = DEFAULT_BASE_HZ): number {
  if (!freqs.length) return guess;
  let sx = 0;
  let sy = 0;
  for (const f of freqs) {
    const c = 1200 * Math.log2(f / guess);
    const a = (2 * Math.PI * c) / STEP_CENTS;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  const offset = (Math.atan2(sy, sx) * STEP_CENTS) / (2 * Math.PI);
  return guess * Math.pow(2, offset / 1200);
}
