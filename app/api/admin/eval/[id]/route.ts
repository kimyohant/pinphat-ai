import { getUser } from "@/lib/auth";
import { all, audit } from "@/lib/db";
import { ensureEvalTables, getSet } from "@/lib/evals";

/** คำตอบทุกข้อของทุกโมเดลพร้อมคะแนนรายผู้ให้คะแนน สำหรับวิเคราะห์ต่อในโปรแกรมสถิติ (เปิดเฉพาะผู้เชี่ยวชาญ เพราะมีเนื้อหาจำกัดสิทธิ์) */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (user.role !== "curator") return new Response("ไม่มีสิทธิ์", { status: 403 });
  ensureEvalTables();
  const { id } = await params;
  const set = getSet(Number(id));
  if (!set) return new Response("ไม่พบชุดทดสอบ", { status: 404 });
  const rows = all<Record<string, string | number | null>>(
    `SELECT i.id AS item_id, i.question, i.answerable, r.id AS run_id, r.label AS model, a.id AS answer_id, a.answer, a.skipped, a.latency_ms, a.cite_ok, a.abstained,
            s.rater_id, s.accuracy, s.grounding, s.language, s.decision_ok, s.comment
     FROM eval_items i JOIN eval_answers a ON a.item_id = i.id JOIN eval_runs r ON r.id = a.run_id
     LEFT JOIN eval_scores s ON s.answer_id = a.id
     WHERE i.set_id = ? ORDER BY i.id, r.id, s.rater_id`,
    set.id,
  );
  const cols = ["item_id", "question", "answerable", "run_id", "model", "answer_id", "answer", "skipped", "latency_ms", "cite_ok", "abstained", "rater_id", "accuracy", "grounding", "language", "decision_ok", "comment"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
  audit(user.id, "eval.export", `evalset:${set.id}`);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pinphat-eval-${set.id}.csv"` } });
}
