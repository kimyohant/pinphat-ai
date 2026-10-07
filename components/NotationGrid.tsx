import { barCount, noteLabel, type Slot } from "@/lib/notation";

/** แสดงโน้ตตัวเลขไทยเป็นห้อง ๆ ใช้ได้ทั้งใน server และ client component */
export function NotationGrid({
  slots,
  current = -1,
  errorBars = [],
  slotState,
  label = "โน้ตตัวเลขไทย",
}: {
  slots: Slot[];
  current?: number;
  errorBars?: number[];
  slotState?: Record<number, "hit" | "miss">;
  label?: string;
}) {
  const bars = barCount(slots);
  return (
    <div className="notation-grid" aria-label={label}>
      {Array.from({ length: bars }, (_, b) => (
        <div key={b} className={`bar${errorBars.includes(b) ? " err" : ""}`}>
          <span className="bn">{b + 1}</span>
          {slots
            .filter((s) => s.bar === b)
            .map((s) => (
              <span
                key={s.index}
                className={["slot", s.note ? "" : "rest", s.index === current ? "now" : "", slotState?.[s.index] ?? ""].join(" ")}
              >
                {noteLabel(s.note, s.octave)}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}
