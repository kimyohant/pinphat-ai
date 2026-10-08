// ข้อมูลของคลังความรู้ กรองตามระดับสิทธิ์ของผู้ชมทุกครั้ง: ข้อมูลที่ถอนความยินยอมหรืออยู่นอกสิทธิ์จะไม่ออกจากเซิร์ฟเวอร์เลย
import { all, one } from "./db";
import { canSee, type Role } from "./access";
import { json } from "./format";

export type ArchiveSeg = {
  id: number;
  kind: string;
  notation: string | null;
  transcript: string | null;
  asset_id: number | null;
  duration_s: number | null;
  peaks: string | null;
  work_id: number | null;
  work: string | null;
  variant: string | null;
  person_id: number | null;
  person: string | null;
  province: string | null;
  code: string;
  access_level: number | null;
  revoked_at: string | null;
  instrument_id: number | null;
  instrument: string | null;
  recorded_on: string | null;
};

const SEG_SQL = `
SELECT sg.id, sg.kind, sg.notation, sg.transcript, sg.asset_id, a.duration_s, a.analysis AS peaks, sg.work_id, w.title AS work, v.name AS variant,
       s.person_id, p.display_name AS person, p.province, s.code, c.access_level, c.revoked_at, sg.instrument_id, i.name_th AS instrument, s.recorded_on
FROM segments sg JOIN sessions s ON s.id = sg.session_id
LEFT JOIN persons p ON p.id = s.person_id LEFT JOIN consents c ON c.id = s.consent_id
LEFT JOIN variants v ON v.id = sg.variant_id LEFT JOIN works w ON w.id = sg.work_id
LEFT JOIN instruments i ON i.id = sg.instrument_id LEFT JOIN assets a ON a.id = sg.asset_id
WHERE sg.status = 'approved'`;

export function visibleSegments(role: Role): ArchiveSeg[] {
  return all<ArchiveSeg>(`${SEG_SQL} ORDER BY s.recorded_on DESC, sg.id`).filter((s) => !s.revoked_at && canSee(role, s.access_level));
}

export function peaksOf(s: Pick<ArchiveSeg, "peaks">): number[] | undefined {
  return json<{ peaks?: number[] }>(s.peaks, {}).peaks;
}

export type PersonRow = { id: number; display_name: string; role: string; province: string | null; district: string | null; birth_year: number | null; bio: string | null };

export function persons(): PersonRow[] {
  return all<PersonRow>("SELECT id, display_name, role, province, district, birth_year, bio FROM persons ORDER BY role DESC, birth_year, id");
}

export function person(id: number): PersonRow | undefined {
  return one<PersonRow>("SELECT id, display_name, role, province, district, birth_year, bio FROM persons WHERE id = ?", id);
}

export function lineage(): { teacher_id: number; student_id: number; note: string | null }[] {
  return all("SELECT teacher_id, student_id, note FROM lineage");
}

export type WorkRow = { id: number; title: string; genre: string | null; description: string | null };
export function works(): WorkRow[] {
  return all<WorkRow>("SELECT id, title, genre, description FROM works ORDER BY id");
}
export function work(id: number): WorkRow | undefined {
  return one<WorkRow>("SELECT id, title, genre, description FROM works WHERE id = ?", id);
}
export function variantsOf(workId: number): { id: number; name: string; description: string | null; person_id: number | null; person: string | null }[] {
  return all("SELECT v.id, v.name, v.description, v.person_id, p.display_name AS person FROM variants v LEFT JOIN persons p ON p.id = v.person_id WHERE v.work_id = ? ORDER BY v.id", workId);
}

/** ความยินยอมล่าสุดของบุคคล ใช้แสดงระดับสิทธิ์และป้ายเงื่อนไขทางวัฒนธรรม */
export function consentOf(personId: number): { access_level: number; tk_labels: string; scope_note: string | null; revoked_at: string | null } | undefined {
  return one("SELECT access_level, tk_labels, scope_note, revoked_at FROM consents WHERE person_id = ? ORDER BY id DESC LIMIT 1", personId);
}

export type TuningRow = { instrument_id: number; base_hz: number; steps: string; person_id: number | null; person: string | null; access_level: number | null; revoked_at: string | null };
export function visibleTunings(role: Role): TuningRow[] {
  return all<TuningRow>(`
    SELECT t.instrument_id, t.base_hz, t.steps, t.person_id, p.display_name AS person, c.access_level, c.revoked_at
    FROM tunings t JOIN segments sg ON sg.id = t.segment_id JOIN sessions s ON s.id = sg.session_id
    LEFT JOIN persons p ON p.id = t.person_id LEFT JOIN consents c ON c.id = s.consent_id`).filter((x) => !x.revoked_at && canSee(role, x.access_level));
}

/** ตัดคำนำหน้าและวงเล็บ "(นามสมมติ)" เหลือชื่อสั้นสำหรับป้ายบนผัง */
export function shortName(name: string): string {
  return name.replace(/\s*\(นามสมมติ\)/, "").replace(/^ครูภูมิปัญญา\s*/, "ครู ");
}

/** อักษรย่อในวงกลมรูปบุคคล: ตัวอักษรของนามสมมติ เช่น "ก." */
export function initialOf(name: string): string {
  const m = shortName(name).match(/([ก-ฮ])\.?$/);
  return m ? m[1] : shortName(name).slice(0, 1);
}

/** แผนผัง 8 จังหวัดอีสานตอนบน: ตำแหน่งโดยประมาณเพื่อการจัดวาง ไม่ใช่แผนที่ตามมาตราส่วน */
export const PROVINCE_LAYOUT: Record<string, { x: number; y: number; en: string; lo: string }> = {
  เลย: { x: 14, y: 58, en: "Loei", lo: "ເລີຍ" },
  หนองบัวลำภู: { x: 30, y: 74, en: "Nong Bua Lam Phu", lo: "ໜອງບົວລຳພູ" },
  อุดรธานี: { x: 40, y: 54, en: "Udon Thani", lo: "ອຸດອນທານີ" },
  หนองคาย: { x: 44, y: 26, en: "Nong Khai", lo: "ໜອງຄາຍ" },
  บึงกาฬ: { x: 70, y: 20, en: "Bueng Kan", lo: "ບຶງການ" },
  สกลนคร: { x: 66, y: 52, en: "Sakon Nakhon", lo: "ສະກົນນະຄອນ" },
  นครพนม: { x: 86, y: 46, en: "Nakhon Phanom", lo: "ນະຄອນພະນົມ" },
  มุกดาหาร: { x: 84, y: 78, en: "Mukdahan", lo: "ມຸກດາຫານ" },
};
