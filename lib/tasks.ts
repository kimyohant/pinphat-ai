// คิวงานกลางของหลังบ้าน (ADR-0001): ทุกงานที่ต้องใช้คนเป็นแถวในตาราง tasks ตารางเดียว
import { all, now, one, run } from "./db";
import type { Role } from "./access";

export type TaskType = "review_transcript" | "review_notation" | "expert_review" | "tutor_flag" | "knowledge_gap" | "consent_request";
export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

export type Task = {
  id: number;
  type: TaskType;
  subject: string;
  title: string | null;
  role: Role;
  assignee_id: number | null;
  assignee: string | null;
  status: TaskStatus;
  due_on: string | null;
  note: string | null;
  created_at: string;
  started_at: string | null;
  done_at: string | null;
};

/** ระยะเวลาที่ควรเสร็จ (วัน) ตามประเภทงาน คำขอจากชุมชนต้องเร็วที่สุด */
const DUE_DAYS: Record<TaskType, number> = {
  consent_request: 1,
  tutor_flag: 3,
  review_transcript: 7,
  expert_review: 7,
  review_notation: 10,
  knowledge_gap: 30,
};

function dueOn(type: TaskType): string {
  return new Date(Date.now() + DUE_DAYS[type] * 86400000).toISOString().slice(0, 10);
}

/** สร้างงาน ถ้ามีงานประเภทเดียวกันของเรื่องเดียวกันค้างอยู่แล้วจะไม่สร้างซ้ำ */
export function createTask(t: { type: TaskType; subject: string; title: string; role: Role; createdBy?: number; assigneeId?: number | null }): number | null {
  const dup = one<{ id: number }>("SELECT id FROM tasks WHERE type = ? AND subject = ? AND status IN ('open', 'in_progress')", t.type, t.subject);
  if (dup) return null;
  return run(
    "INSERT INTO tasks (type, subject, title, role, assignee_id, status, due_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)",
    t.type,
    t.subject,
    t.title.slice(0, 200),
    t.role,
    t.assigneeId ?? null,
    dueOn(t.type),
    t.createdBy ?? 0,
    now(),
  ).id;
}

/** ปิดงานที่ค้างของเรื่องนี้ (เมื่อเรื่องต้นทางเสร็จแล้ว ไม่ว่าจะทำจากหน้าไหน) */
export function closeTasks(subject: string, types?: TaskType[], status: "done" | "cancelled" = "done"): void {
  const filter = types?.length ? ` AND type IN (${types.map(() => "?").join(",")})` : "";
  run(`UPDATE tasks SET status = ?, done_at = ? WHERE subject = ? AND status IN ('open', 'in_progress')${filter}`, status, now(), subject, ...(types ?? []));
}

const TASK_SQL = `SELECT t.*, u.name AS assignee FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

/** งานที่ผู้ใช้เห็น: งานที่มอบให้ตัวเอง + งานของบทบาทตัวเองที่ยังไม่มีคนรับ (ผู้เชี่ยวชาญเห็นทั้งหมด) */
export function tasksFor(userId: number, role: Role, includeDone = false): Task[] {
  const st = includeDone ? "" : "AND t.status IN ('open', 'in_progress')";
  if (role === "curator") return all<Task>(`${TASK_SQL} WHERE 1 = 1 ${st} ORDER BY t.due_on, t.id`);
  return all<Task>(`${TASK_SQL} WHERE (t.assignee_id = ? OR (t.assignee_id IS NULL AND t.role = ?)) ${st} ORDER BY t.due_on, t.id`, userId, role);
}

export function getTask(id: number): Task | undefined {
  return one<Task>(`${TASK_SQL} WHERE t.id = ?`, id);
}

/** สัดส่วนอักขระที่ต่างกันระหว่างร่าง AI กับฉบับที่รับรอง (0 = ไม่แก้เลย, 1 = เขียนใหม่ทั้งหมด)
 *  ใช้ Myers diff นับจำนวนการเพิ่ม/ลบอักขระ หารด้วยความยาวรวมของทั้งสองฉบับ */
export function editRate(draft: string, final: string): number {
  const norm = (s: string) => [...s.replace(/\s+/g, " ").trim()];
  const x = norm(draft);
  const y = norm(final);
  const N = x.length;
  const M = y.length;
  if (N + M === 0) return 0;
  const max = N + M;
  const v = new Int32Array(2 * max + 2);
  const off = max + 1;
  const cap = Math.min(max, 6000); // ร่างที่ถูกเขียนใหม่เกือบทั้งหมด ไม่ต้องคำนวณละเอียด
  for (let d = 0; d <= cap; d++) {
    for (let k = -d; k <= d; k += 2) {
      let xx = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let yy = xx - k;
      while (xx < N && yy < M && x[xx] === y[yy]) {
        xx++;
        yy++;
      }
      v[off + k] = xx;
      if (xx >= N && yy >= M) return Math.round((d / max) * 1000) / 1000;
    }
  }
  return Math.min(1, Math.round((cap / max) * 1000) / 1000);
}
