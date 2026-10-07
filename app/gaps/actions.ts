"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit, now, run } from "@/lib/db";
import { closeTasks } from "@/lib/tasks";

export async function updateGap(formData: FormData) {
  const user = await requireRole("collector", "curator");
  const id = Number(formData.get("gapId"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const sessionId = Number(formData.get("sessionId")) || null;
  if (decision === "plan") {
    if (!sessionId) return;
    run("UPDATE knowledge_gaps SET status = 'planned', session_id = ?, note = COALESCE(?, note) WHERE id = ?", sessionId, note, id);
  } else if (decision === "answered" || decision === "dismissed") {
    run("UPDATE knowledge_gaps SET status = ?, note = COALESCE(?, note), closed_by = ?, closed_at = ? WHERE id = ?", decision, note, user.id, now(), id);
  } else return;
  // วางแผนหรือปิดแล้ว งาน "คำถามที่คลังยังตอบไม่ได้" ถือว่าเสร็จ
  closeTasks(`gap:${id}`);
  audit(user.id, `gap.${decision}`, `gap:${id}`, note ?? "");
  revalidatePath("/gaps");
  revalidatePath("/work");
}
