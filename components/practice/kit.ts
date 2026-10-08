// ชุดเครื่องบนจอ: แต่ละวิธีเล่นมีลูกให้ตีกี่ลูก ผูกกับแป้นไหน และให้เสียงอย่างไร ใช้ฝั่ง client เท่านั้น
import { NOTES, noteFreq, type NoteName, type Stroke } from "@/lib/notation";
import { ching, click, drum, gong, pi, ranat, ranatThum } from "@/lib/synth-client";

export type PlayKind = "bars" | "gongs" | "wind" | "drum" | "cymbal";
export type Key = { note: NoteName | null; octave: number; stroke: Stroke | null; key: string; alt: string };

export const isPitched = (k: PlayKind) => k === "bars" || k === "gongs" || k === "wind";

const MELODIC: Key[] = [
  ...NOTES.map((n, i) => ({ note: n, octave: 0, stroke: null, key: String(i + 1), alt: "asdfghj"[i] })),
  { note: "ด", octave: 1, stroke: null, key: "8", alt: "k" },
];

export function keysFor(kind: PlayKind): Key[] {
  if (kind === "drum")
    return [
      { note: null, octave: 0, stroke: "ต", key: "1", alt: "f" },
      { note: null, octave: 0, stroke: "ป", key: "2", alt: "j" },
    ];
  if (kind === "cymbal")
    return [
      { note: null, octave: 0, stroke: "ฉ", key: "1", alt: "f" },
      { note: null, octave: 0, stroke: "บ", key: "2", alt: "j" },
    ];
  return MELODIC;
}

/**
 * เล่นเสียงของลูกหนึ่ง register คือช่วงเสียงของเครื่อง (ระนาดทุ้มและฆ้องวงต่ำกว่าระนาดเอกหนึ่งช่วงทบ)
 * hold ใช้กับปี่ ซึ่งเสียงยาวตามความยาวโน้ต
 */
export function strike(ctx: AudioContext, kind: PlayKind, register: number, k: Pick<Key, "note" | "octave" | "stroke">, when: number, base: number, hold = 0.45): void {
  if (kind === "drum") return drum(ctx, when, k.stroke !== "ป");
  if (kind === "cymbal") return ching(ctx, when, k.stroke === "บ", 0.16);
  if (!k.note) return;
  const f = noteFreq(k.note, k.octave + register, base);
  if (kind === "gongs") return gong(ctx, f, when);
  if (kind === "wind") return pi(ctx, f, when, hold);
  if (register < 0) return ranatThum(ctx, f, when);
  return ranat(ctx, f, when);
}

/** เสียงนำจังหวะ: ฝึกฉิ่งใช้ไม้เคาะแทน จะได้ไม่ปนกับเสียงฉิ่งของผู้เรียน */
export function pulse(ctx: AudioContext, kind: PlayKind, when: number, closed: boolean, gain: number): void {
  if (kind === "cymbal") click(ctx, when, closed, gain);
  else ching(ctx, when, closed, gain);
}
