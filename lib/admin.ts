// หน้าผู้ดูแลระบบ: ตัวชี้วัด วช., สถานะเซิร์ฟเวอร์ AI, สำรองข้อมูล และทะเบียนคำศัพท์
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, MEDIA_DIR, all, db, one, run, tx } from "./db";
import { indexSegment, reindexConsent } from "./kb";
import { UNSLOTH, gpuState, loadedKind, remoteGeneration, unslothEnabled, type ModelKind } from "./unsloth";

// ---------- ตัวชี้วัด ----------

export type Kpi = { key: string; group: "output" | "outcome"; value: number; target: number; unit?: "hours" };

/** เป้าหมายตั้งต้นจากแบบระบบ (ปรับได้ด้วย env เมื่อได้งบประมาณจริง) */
const TARGET = {
  hours: Number(process.env.KPI_HOURS || 300),
  persons: Number(process.env.KPI_PERSONS || 25),
  variants: Number(process.env.KPI_VARIANTS || 60),
  lessons: Number(process.env.KPI_LESSONS || 40),
  schools: Number(process.env.KPI_SCHOOLS || 30),
  students: Number(process.env.KPI_STUDENTS || 1500),
  teachers: Number(process.env.KPI_TEACHERS || 60),
};

const n = (sql: string, ...p: (string | number)[]) => one<{ n: number }>(sql, ...p)?.n ?? 0;

export function kpis(): Kpi[] {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  return [
    { key: "mHours", group: "output", value: Math.round((n("SELECT COALESCE(SUM(duration_s), 0) AS n FROM assets") / 3600) * 100) / 100, target: TARGET.hours, unit: "hours" },
    { key: "mPersons", group: "output", value: n("SELECT COUNT(DISTINCT person_id) AS n FROM sessions WHERE person_id IS NOT NULL"), target: TARGET.persons },
    {
      key: "mVariants",
      group: "output",
      value: n("SELECT COUNT(DISTINCT COALESCE('v' || variant_id, 's' || id)) AS n FROM segments WHERE status = 'approved' AND notation IS NOT NULL"),
      target: TARGET.variants,
    },
    { key: "mLessons", group: "output", value: n("SELECT COUNT(*) AS n FROM lessons"), target: TARGET.lessons },
    {
      key: "mSchools",
      group: "outcome",
      value: n("SELECT COUNT(DISTINCT u.school_id) AS n FROM practice_attempts a JOIN users u ON u.id = a.user_id WHERE u.school_id IS NOT NULL"),
      target: TARGET.schools,
    },
    { key: "mStudents", group: "outcome", value: n("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND active = 1"), target: TARGET.students },
    { key: "mActive", group: "outcome", value: n("SELECT COUNT(DISTINCT user_id) AS n FROM practice_attempts WHERE created_at >= ?", since), target: TARGET.students },
    { key: "mTeachers", group: "outcome", value: n("SELECT COUNT(*) AS n FROM users WHERE role = 'teacher' AND active = 1"), target: TARGET.teachers },
  ];
}

export function ops() {
  const today = new Date().toISOString().slice(0, 10);
  const rate = one<{ avg: number | null; c: number }>("SELECT AVG(edit_rate) AS avg, COUNT(edit_rate) AS c FROM segments WHERE edit_rate IS NOT NULL");
  return {
    open: n("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('open', 'in_progress')"),
    overdue: n("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('open', 'in_progress') AND due_on < ?", today),
    pending: n("SELECT COUNT(*) AS n FROM segments WHERE status IN ('pending', 'edited')"),
    gaps: n("SELECT COUNT(*) AS n FROM knowledge_gaps WHERE status = 'open'"),
    requests: n("SELECT COUNT(*) AS n FROM consent_requests WHERE status IN ('received', 'verified')"),
    consents: n("SELECT COUNT(*) AS n FROM consents WHERE revoked_at IS NULL"),
    revoked: n("SELECT COUNT(*) AS n FROM consents WHERE revoked_at IS NOT NULL"),
    editRate: rate?.c ? rate.avg : null,
    byType: all<{ type: string; n: number }>("SELECT type, COUNT(*) AS n FROM tasks WHERE status IN ('open', 'in_progress') GROUP BY type ORDER BY n DESC"),
  };
}

// ---------- เซิร์ฟเวอร์ AI ----------

export type AiStatus = { configured: boolean; reachable: boolean; loaded: ModelKind | null; busy: string | null; generating: "image" | "video" | null; models: { text: string; image: string; video: string } };

function within<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
}

/** ไม่ปล่อยให้หน้าผู้ดูแลค้างถ้าเซิร์ฟเวอร์ AI ล่ม: รอไม่เกิน 4 วินาที */
export async function aiStatus(): Promise<AiStatus> {
  const models = { text: UNSLOTH.text, image: UNSLOTH.image, video: UNSLOTH.video };
  if (!unslothEnabled()) return { configured: false, reachable: false, loaded: null, busy: null, generating: null, models };
  const [k, g] = await Promise.all([within(loadedKind().catch(() => "timeout" as const), 4000), within(remoteGeneration().catch(() => "timeout" as const), 4000)]);
  const reachable = k !== "timeout";
  return {
    configured: true,
    reachable,
    loaded: reachable ? (k as ModelKind | null) : null,
    busy: gpuState().busy,
    generating: g !== "timeout" && g ? g.kind : null,
    models,
  };
}

// ---------- สำรองข้อมูล ----------

export const BACKUP_DIR = path.join(DATA_DIR, "backups");

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let s = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(/*turbopackIgnore: true*/ dir, e.name);
    s += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return s;
}

export function storage() {
  const dbFile = path.join(/*turbopackIgnore: true*/ DATA_DIR, "pinphat.db");
  const backups = fs.existsSync(BACKUP_DIR)
    ? fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith(".db"))
        .map((f) => ({ file: f, size: fs.statSync(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, f)).size, at: fs.statSync(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, f)).mtime.toISOString() }))
        .sort((a, b) => b.at.localeCompare(a.at))
    : [];
  return {
    db: fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0,
    media: dirSize(MEDIA_DIR) + dirSize(path.join(/*turbopackIgnore: true*/ DATA_DIR, "studio")),
    backups: backups.slice(0, 8),
  };
}

/** สำรองฐานข้อมูลแบบ consistent ระหว่างที่ระบบทำงานอยู่ (VACUUM INTO) */
export function backupNow(): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const file = `pinphat-${stamp}.db`;
  const target = path.join(/*turbopackIgnore: true*/ BACKUP_DIR, file).replace(/'/g, "''");
  db().exec(`VACUUM INTO '${target}'`);
  return file;
}

export function humanSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

// ---------- ทะเบียนคำศัพท์ ----------

/** สร้างดัชนีใหม่ให้ทุกส่วนย่อยที่รับรองแล้วซึ่งอ้างถึงเพลงหรือทางนี้ (ชื่อเพลงอยู่ในข้อความที่ AI ค้น) */
export function reindexWork(workId: number): number {
  return all<{ id: number }>("SELECT id FROM segments WHERE status = 'approved' AND (work_id = ? OR variant_id IN (SELECT id FROM variants WHERE work_id = ?))", workId, workId).reduce(
    (s, r) => s + indexSegment(r.id),
    0,
  );
}

export function reindexPerson(personId: number): number {
  return all<{ id: number }>("SELECT id FROM consents WHERE person_id = ?", personId).reduce((s, c) => s + reindexConsent(c.id), 0);
}

/** ย้ายทุกการอ้างอิงจากรายการซ้ำไปยังรายการหลัก แล้วลบรายการซ้ำ คืนจำนวนแถวที่ย้าย */
export function mergeWork(from: number, into: number): number {
  if (from === into) return 0;
  const moved = tx(() => {
    const a = run("UPDATE variants SET work_id = ? WHERE work_id = ?", into, from).changes;
    const b = run("UPDATE segments SET work_id = ? WHERE work_id = ?", into, from).changes;
    run("DELETE FROM works WHERE id = ?", from);
    return a + b;
  });
  reindexWork(into);
  return moved;
}

export function mergeVariant(from: number, into: number): number {
  if (from === into) return 0;
  const moved = tx(() => {
    const a = run("UPDATE segments SET variant_id = ? WHERE variant_id = ?", into, from).changes;
    run("DELETE FROM variants WHERE id = ?", from);
    return a;
  });
  const w = one<{ work_id: number }>("SELECT work_id FROM variants WHERE id = ?", into);
  if (w) reindexWork(w.work_id);
  return moved;
}

export function mergePerson(from: number, into: number): number {
  if (from === into) return 0;
  const moved = tx(() => {
    let c = 0;
    for (const [table, col] of [
      ["lineage", "teacher_id"],
      ["lineage", "student_id"],
      ["variants", "person_id"],
      ["consents", "person_id"],
      ["sessions", "person_id"],
      ["tunings", "person_id"],
      ["kb_chunks", "person_id"],
      ["payments", "person_id"],
    ] as const) {
      c += run(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, into, from).changes;
    }
    // สายสืบทอดที่ชี้หาตัวเองหลังรวม (ครู = ศิษย์) ไม่มีความหมาย
    run("DELETE FROM lineage WHERE teacher_id = student_id");
    run("DELETE FROM persons WHERE id = ?", from);
    return c;
  });
  reindexPerson(into);
  return moved;
}

export function usage() {
  const map = (sql: string) => new Map(all<{ id: number; n: number }>(sql).map((r) => [r.id, r.n]));
  return {
    works: map("SELECT w.id, (SELECT COUNT(*) FROM segments s WHERE s.work_id = w.id) + (SELECT COUNT(*) FROM variants v WHERE v.work_id = w.id) AS n FROM works w"),
    variants: map("SELECT v.id, (SELECT COUNT(*) FROM segments s WHERE s.variant_id = v.id) AS n FROM variants v"),
    instruments: map("SELECT i.id, (SELECT COUNT(*) FROM segments s WHERE s.instrument_id = i.id) + (SELECT COUNT(*) FROM assets a WHERE a.instrument_id = i.id) AS n FROM instruments i"),
    persons: map("SELECT p.id, (SELECT COUNT(*) FROM sessions s WHERE s.person_id = p.id) + (SELECT COUNT(*) FROM consents c WHERE c.person_id = p.id) AS n FROM persons p"),
  };
}
