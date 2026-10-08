// เครื่องดนตรีสำหรับหน้าฝึกเล่น: อ่านจากทะเบียนเครื่องดนตรีในคลัง เพิ่มเครื่องในคลังเมื่อไร หน้าฝึกเล่นเห็นเองทันที
// แต่ละเครื่องมี "วิธีเล่นบนจอ" ห้าแบบ: ลูกระนาด วงฆ้อง ปี่ กลอง ฉิ่ง
import { all, db } from "./db";

export type PlayKind = "bars" | "gongs" | "wind" | "drum" | "cymbal";

export type InstrumentRow = {
  id: number;
  name_th: string;
  name_lo: string | null;
  name_en: string | null;
  family: string | null;
  description: string | null;
  play_kind: PlayKind;
  play_register: number;
  lessons: number;
};

/** เดาวิธีเล่นจากชื่อ ใช้กับเครื่องที่เพิ่มเข้าทะเบียนใหม่และยังไม่ได้ระบุ */
function guessKind(name: string, family: string | null): { kind: PlayKind; register: number } {
  const n = name.toLowerCase();
  if (/ทุ้ม|thum/.test(n)) return { kind: "bars", register: -1 };
  if (/ระนาด|ranat/.test(n)) return { kind: "bars", register: 0 };
  if (/ฆ้อง|khong|gong/.test(n)) return { kind: "gongs", register: -1 };
  if (/ปี่|pi\b|oboe|แคน|khaen|ขลุ่ย/.test(n)) return { kind: "wind", register: 0 };
  if (/ฉิ่ง|ฉาบ|ching|chap|cymbal/.test(n)) return { kind: "cymbal", register: 0 };
  if (/กลอง|ตะโพน|โทน|drum|klong|taphon/.test(n) || /หนัง/.test(family ?? "")) return { kind: "drum", register: 0 };
  return { kind: "bars", register: 0 };
}

// บทเรียนตั้งต้นของเครื่องที่ยังไม่มีบทเรียนเลย เป็นแบบฝึกสาธิต ไม่ใช่ทางของครูภูมิปัญญาจริง
const STARTERS: Record<PlayKind, { title: string; description: string; notation: string; tempo: number; register?: number }[]> = {
  bars: [
    {
      title: "ไล่เสียงลูกทุ้ม",
      description: "ตีไล่เสียงช้า ๆ ช่องละหนึ่งลูก ฟังเสียงทุ้มให้กังวานจนจบก่อนตีลูกถัดไป",
      notation: "- - - ด | - - - ร | - - - ม | - - - ซ | - - - ล | - - - ซ | - - - ม | - - - ด",
      tempo: 120,
    },
  ],
  gongs: [
    {
      title: "ฆ้องวง เดินเสียงคู่",
      description: "ตีบนจังหวะที่สองและสี่ เดินขึ้นแล้วลง ให้มือซ้ายขวาสลับกันตามตำแหน่งลูกฆ้อง",
      notation: "- ด - ม | - ซ - ดํ | - ซ - ม | - ร - ด",
      tempo: 110,
    },
  ],
  wind: [
    {
      title: "ปี่ เป่าลมยาว",
      description: "เป่าให้เสียงยาวเต็มห้อง หายใจระหว่างห้อง ฝึกคุมลมให้เสียงนิ่ง",
      notation: "- - - ด | - - - ร | - - - ม | - - - ฟ | - - - ซ | - - - ฟ | - - - ม | - - - ร",
      tempo: 90,
    },
  ],
  drum: [
    {
      title: "กลอง หน้าทับพื้นฐาน",
      description: "ตุ๊บ หน้ากลองเปิดเสียงต่ำ สลับ ป๊ะ ตีปิดเสียงสูง ให้ ป๊ะ ลงพร้อมฉับทุกห้อง",
      notation: "- ต - ป | - ต ต ป | - ต - ป | - ต ต ป",
      tempo: 120,
    },
  ],
  cymbal: [
    {
      title: "ฉิ่ง ฉิ่งฉับชั้นเดียว",
      description: "ฉิ่ง เปิดให้ก้องบนจังหวะที่สอง ฉับ ประกบปิดบนจังหวะที่สี่ ฉิ่งเป็นหัวใจที่ทั้งวงฟังจังหวะ",
      notation: "- ฉ - บ | - ฉ - บ | - ฉ - บ | - ฉ - บ",
      tempo: 100,
    },
  ],
};

const g = globalThis as unknown as { __ppInstrumentsReady?: boolean };

/** เพิ่มคอลัมน์และบทเรียนตั้งต้นครั้งแรกที่ใช้ ทำซ้ำได้โดยไม่สร้างข้อมูลซ้ำ */
function ensure() {
  if (g.__ppInstrumentsReady) return;
  const d = db();
  const cols = (d.prepare("PRAGMA table_info(instruments)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("play_kind")) d.exec("ALTER TABLE instruments ADD COLUMN play_kind TEXT");
  if (!cols.includes("play_register")) d.exec("ALTER TABLE instruments ADD COLUMN play_register INTEGER");
  const rows = d.prepare("SELECT id, name_th, name_en, family, play_kind FROM instruments").all() as { id: number; name_th: string; name_en: string | null; family: string | null; play_kind: string | null }[];
  const now = new Date().toISOString();
  for (const r of rows) {
    const guess = guessKind(`${r.name_th} ${r.name_en ?? ""}`, r.family);
    if (!r.play_kind) d.prepare("UPDATE instruments SET play_kind = ?, play_register = ? WHERE id = ?").run(guess.kind, guess.register, r.id);
    const has = (d.prepare("SELECT COUNT(*) AS n FROM lessons WHERE instrument_id = ?").get(r.id) as { n: number }).n;
    if (has) continue;
    const kind = (r.play_kind as PlayKind) || guess.kind;
    for (const s of STARTERS[kind]) {
      // ระนาดเอกได้บทเรียนเดิมจากข้อมูลสาธิตแล้ว บทไล่เสียงลูกทุ้มเหมาะกับระนาดทุ้มเท่านั้น
      const title = kind === "bars" && guess.register === 0 ? `${r.name_th} ไล่เสียง` : s.title;
      d.prepare(
        "INSERT INTO lessons (title, grade, indicator, description, segment_id, instrument_id, notation, tempo, difficulty, base_hz, created_by, created_at) VALUES (?, 'ม.1 ถึง ม.3', 'ศ 2.1 ม.1/1', ?, NULL, ?, ?, ?, 1, NULL, 0, ?)",
      ).run(title, s.description, r.id, s.notation, s.tempo, now);
    }
  }
  g.__ppInstrumentsReady = true;
}

export function instruments(): InstrumentRow[] {
  ensure();
  return all<InstrumentRow>(
    `SELECT i.id, i.name_th, i.name_lo, i.name_en, i.family, i.description, COALESCE(i.play_kind, 'bars') AS play_kind, COALESCE(i.play_register, 0) AS play_register,
            (SELECT COUNT(*) FROM lessons l WHERE l.instrument_id = i.id) AS lessons
     FROM instruments i ORDER BY i.id`,
  );
}

export function instrument(id: number | null | undefined): InstrumentRow | undefined {
  if (id == null) return undefined;
  return instruments().find((i) => i.id === id);
}

/** ชื่อเครื่องตามภาษาที่เลือก ภาษาที่ไม่มีชื่อในทะเบียนใช้ชื่อไทย */
export function instrumentName(i: Pick<InstrumentRow, "name_th" | "name_lo" | "name_en">, locale: string): string {
  if (locale === "lo" && i.name_lo) return i.name_lo;
  if (locale === "en" && i.name_en) return i.name_en.replace(/\s*\(.*\)$/, "");
  return i.name_th;
}
