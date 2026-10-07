// ช่องว่างความรู้: คำถามที่ครูผู้ช่วย AI ตอบไม่ได้เพราะคลังยังไม่มีข้อมูลในระดับสิทธิ์ของผู้ถาม
// รวมคำถามที่เหมือนกันเป็นแถวเดียว และสร้างงานให้ทีมภาคสนามเมื่อพบคำถามใหม่
import { now, one, run } from "./db";
import { createTask } from "./tasks";
import type { Role } from "./access";

/** ทำให้คำถามที่ต่างกันแค่การเว้นวรรค เครื่องหมาย หรือคำลงท้าย กลายเป็นคีย์เดียวกัน */
export function normQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[\s?？!！.,，"'“”()]+/g, "")
    .replace(/(ครับ|คับ|ค่ะ|คะ|จ้า|จ้ะ|นะ|ເດີ|ແດ່)+$/u, "");
}

export function recordGap(question: string, role: Role): void {
  const q = question.trim().slice(0, 500);
  const norm = normQuestion(q);
  if (norm.length < 4) return;
  const row = one<{ id: number; roles: string; status: string }>("SELECT id, roles, status FROM knowledge_gaps WHERE norm = ?", norm);
  if (row) {
    const roles = new Set<string>(JSON.parse(row.roles || "[]"));
    roles.add(role);
    // ถ้าเคยปิดว่ามีข้อมูลแล้ว แต่ยังตอบไม่ได้อีก ให้เปิดใหม่
    const status = row.status === "answered" ? "open" : row.status;
    run("UPDATE knowledge_gaps SET asked = asked + 1, roles = ?, status = ?, last_asked_at = ? WHERE id = ?", JSON.stringify([...roles]), status, now(), row.id);
    if (status === "open" && row.status !== "open") createTask({ type: "knowledge_gap", subject: `gap:${row.id}`, title: q, role: "collector" });
    return;
  }
  const id = run(
    "INSERT INTO knowledge_gaps (question, norm, asked, roles, status, created_at, last_asked_at) VALUES (?, ?, 1, ?, 'open', ?, ?)",
    q,
    norm,
    JSON.stringify([role]),
    now(),
    now(),
  ).id;
  createTask({ type: "knowledge_gap", subject: `gap:${id}`, title: q, role: "collector" });
}
