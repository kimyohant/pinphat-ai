"use client";
// เครื่องดนตรีบนจอที่ตีได้จริง หน้าตาต่างกันตามวิธีเล่น: ลูกระนาด วงฆ้อง รูนิ้วปี่ หน้ากลอง ฉิ่งฉับ
import { noteLabel } from "@/lib/notation";
import type { Key, PlayKind } from "./kit";

type Props = {
  kind: PlayKind;
  register: number;
  keys: Key[];
  lit: number | null;
  onStrike: (i: number) => void;
  label: string;
  strokeName: (s: string) => string;
  keyLabel: (k: Key) => string;
};

export function VirtualInstrument({ kind, register, keys, lit, onStrike, label, strokeName, keyLabel }: Props) {
  // pointerdown แทน click: นิ้วแตะแล้วดังทันที ไม่ต้องรอยกนิ้ว จังหวะจึงไม่ช้าไปราว 100 ms
  const press = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    onStrike(i);
  };
  const cls = (i: number) => (lit === i ? "hit" : undefined);

  if (kind === "gongs") {
    const n = keys.length;
    return (
      <div className="vi vi-gongs" role="group" aria-label={label}>
        {/* รางหวายโค้งตามแนวลูกฆ้อง วาดด้วยจุดชุดเดียวกับตำแหน่งลูก จึงตรงกันทุกขนาดจอ */}
        <svg className="vi-gong-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path
            d={Array.from({ length: 23 }, (_, j) => {
              const a = ((150 + (j * 240) / 22) * Math.PI) / 180;
              return `${j ? "L" : "M"} ${(50 + 40 * Math.cos(a)).toFixed(2)} ${(56 + 40 * Math.sin(a)).toFixed(2)}`;
            }).join(" ")}
          />
        </svg>
        {keys.map((k, i) => {
          const a = ((160 + (i * 220) / (n - 1)) * Math.PI) / 180;
          return (
            <button
              key={i}
              type="button"
              className={cls(i)}
              style={{ "--x": `${50 + 40 * Math.cos(a)}%`, "--y": `${56 + 40 * Math.sin(a)}%`, "--s": `${64 - i * 2.4}px` } as React.CSSProperties}
              onPointerDown={press(i)}
              aria-label={keyLabel(k)}
            >
              <span className="boss" />
              <b>{noteLabel(k.note, k.octave)}</b>
              <small>{k.key}</small>
            </button>
          );
        })}
      </div>
    );
  }

  if (kind === "wind") {
    return (
      <div className="vi vi-wind" role="group" aria-label={label}>
        <div className="vi-pi">
          <span className="vi-reed" aria-hidden="true" />
          <div className="vi-holes">
            {keys.map((k, i) => (
              <button key={i} type="button" className={cls(i)} onPointerDown={press(i)} aria-label={keyLabel(k)}>
                <span className="hole" />
                <b>{noteLabel(k.note, k.octave)}</b>
                <small>{k.key}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (kind === "drum" || kind === "cymbal") {
    return (
      <div className={`vi vi-pads ${kind}`} role="group" aria-label={label}>
        {keys.map((k, i) => (
          <button key={i} type="button" className={`pad pad-${i}${lit === i ? " hit" : ""}`} onPointerDown={press(i)} aria-label={keyLabel(k)}>
            <span className="pad-face" aria-hidden="true" />
            <b>{strokeName(k.stroke ?? "")}</b>
            <small>
              {k.stroke} · {k.key}
            </small>
          </button>
        ))}
      </div>
    );
  }

  // ลูกระนาด: ระนาดทุ้มลูกกว้างและเตี้ยกว่า สีไม้เข้มกว่า
  const thum = register < 0;
  return (
    <div className={`vi vi-bars${thum ? " thum" : ""}`} role="group" aria-label={label}>
      {keys.map((k, i) => (
        <button key={i} type="button" className={cls(i)} style={{ height: (thum ? 150 : 168) - i * (thum ? 7 : 10) }} onPointerDown={press(i)} aria-label={keyLabel(k)}>
          <span>
            {noteLabel(k.note, k.octave)}
            <small>{k.key}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
