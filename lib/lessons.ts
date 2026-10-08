import { all, one } from "./db";
import { canSee, type Role } from "./access";

export type LessonRow = {
  id: number;
  title: string;
  grade: string | null;
  indicator: string | null;
  description: string | null;
  notation: string;
  tempo: number;
  difficulty: number;
  base_hz: number | null;
  segment_id: number | null;
  instrument_id: number | null;
  instrument: string | null;
  person: string | null;
  variant: string | null;
  access_level: number | null;
  revoked_at: string | null;
};

const SQL = `
SELECT l.id, l.title, l.grade, l.indicator, l.description, l.notation, l.tempo, l.difficulty, l.base_hz, l.segment_id, l.instrument_id,
       i.name_th AS instrument, p.display_name AS person, v.name AS variant, c.access_level, c.revoked_at
FROM lessons l
LEFT JOIN instruments i ON i.id = l.instrument_id
LEFT JOIN segments sg ON sg.id = l.segment_id
LEFT JOIN sessions s ON s.id = sg.session_id
LEFT JOIN persons p ON p.id = s.person_id
LEFT JOIN variants v ON v.id = sg.variant_id
LEFT JOIN consents c ON c.id = s.consent_id`;

/** บทเรียนที่ไม่ได้มาจากการบันทึกของครูภูมิปัญญา (แบบฝึกพื้นฐาน) ถือเป็นระดับสาธารณะ */
export function lessonLevel(l: LessonRow): number {
  if (!l.segment_id) return 1;
  if (l.revoked_at) return 5;
  return l.access_level ?? 5;
}

export function visibleLessons(role: Role): LessonRow[] {
  return all<LessonRow>(`${SQL} ORDER BY l.difficulty, l.id`).filter((l) => canSee(role, lessonLevel(l)));
}

export function getLesson(id: number): LessonRow | undefined {
  return one<LessonRow>(`${SQL} WHERE l.id = ?`, id);
}
