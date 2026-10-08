"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { audit, now, one, run } from "@/lib/db";
import { candidates, ensureEvalTables, items, saveScore, startRun } from "@/lib/evals";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const hasRuns = (setId: number) => (one<{ n: number }>("SELECT COUNT(*) AS n FROM eval_runs WHERE set_id = ?", setId)?.n ?? 0) > 0;

export async function createSet(formData: FormData) {
  const user = await requireRole("curator");
  ensureEvalTables();
  const name = str(formData, "name");
  if (!name) return;
  const levels = [1, 2, 3, 4].filter((l) => formData.get(`level${l}`));
  const id = run(
    "INSERT INTO eval_sets (name, description, levels, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
    name,
    str(formData, "description"),
    JSON.stringify(levels.length ? levels : [1, 2]),
    user.id,
    now(),
  ).id;
  audit(user.id, "eval.set.create", `evalset:${id}`, name);
  redirect(`/admin/eval/${id}`);
}

/** เพิ่มคำถามทีละข้อหรือหลายบรรทัด (คำถาม | คำตอบอ้างอิง | no) ได้เฉพาะชุดที่ยังไม่เคยรัน */
export async function addItems(formData: FormData) {
  const user = await requireRole("curator");
  const setId = Number(formData.get("setId"));
  if (hasRuns(setId)) return;
  const rows: [string, string, number][] = [];
  if (str(formData, "question")) rows.push([str(formData, "question"), str(formData, "reference"), formData.get("unanswerable") ? 0 : 1]);
  for (const line of str(formData, "bulk").split(/\r?\n/)) {
    const [q, ref = "", flag = ""] = line.split("|").map((x) => x.trim());
    if (q) rows.push([q, ref, /^(no|ไม่|ບໍ່)/i.test(flag) ? 0 : 1]);
  }
  for (const [q, ref, ok] of rows) run("INSERT INTO eval_items (set_id, question, reference, answerable, created_at) VALUES (?, ?, ?, ?, ?)", setId, q.slice(0, 500), ref.slice(0, 2000), ok, now());
  audit(user.id, "eval.items.add", `evalset:${setId}`, `${rows.length}`);
  revalidatePath(`/admin/eval/${setId}`);
}

export async function removeItem(itemId: number, setId: number) {
  const user = await requireRole("curator");
  if (hasRuns(setId)) return;
  run("DELETE FROM eval_items WHERE id = ? AND set_id = ?", itemId, setId);
  audit(user.id, "eval.items.remove", `evalitem:${itemId}`);
  revalidatePath(`/admin/eval/${setId}`);
}

export async function startEval(formData: FormData) {
  const user = await requireRole("curator");
  const setId = Number(formData.get("setId"));
  if (!items(setId).length) return;
  const c = (await candidates()).find((x) => x.key === str(formData, "candidate") && x.available);
  if (!c) return;
  const id = startRun(setId, c, user.id);
  audit(user.id, "eval.run.start", `evalrun:${id}`, c.key);
  redirect(`/admin/eval/${setId}#runs`);
}

/** บันทึกคะแนนทุกคำตอบของข้อนี้ แล้วไปข้อถัดไป */
export async function saveRatings(formData: FormData) {
  const user = await requireRole("curator");
  const setId = Number(formData.get("setId"));
  const index = Number(formData.get("index"));
  const ids = str(formData, "answerIds").split(",").map(Number).filter(Boolean);
  const clamp = (v: unknown) => Math.min(5, Math.max(1, Number(v) || 0));
  let saved = 0;
  for (const id of ids) {
    const acc = formData.get(`acc_${id}`);
    const dec = formData.get(`dec_${id}`);
    if (acc == null || dec == null) continue; // ให้คะแนนไม่ครบ ข้ามคำตอบนี้ไว้ก่อน
    saveScore(id, user.id, {
      accuracy: clamp(acc),
      grounding: clamp(formData.get(`gro_${id}`) ?? acc),
      language: clamp(formData.get(`lan_${id}`) ?? acc),
      decision_ok: dec === "1" ? 1 : 0,
      comment: str(formData, `com_${id}`).slice(0, 500),
    });
    saved++;
  }
  audit(user.id, "eval.rate", `evalset:${setId}`, `item#${index + 1} ${saved}/${ids.length}`);
  revalidatePath(`/admin/eval/${setId}`);
  redirect(`/admin/eval/${setId}/rate?i=${index + 1}&saved=1`);
}
