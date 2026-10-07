"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit, now, one, run } from "@/lib/db";
import { getTask } from "@/lib/tasks";

const BACK = ["collector", "assistant", "curator", "community"] as const;

export async function claimTask(id: number) {
  const user = await requireRole(...BACK);
  const t = getTask(id);
  if (!t || t.status === "done" || t.status === "cancelled") return;
  if (t.role !== user.role && user.role !== "curator") return;
  run("UPDATE tasks SET assignee_id = ?, status = 'in_progress', started_at = COALESCE(started_at, ?) WHERE id = ?", user.id, now(), id);
  audit(user.id, "task.claim", `task:${id}`, t.subject);
  revalidatePath("/work");
}

export async function releaseTask(id: number) {
  const user = await requireRole(...BACK);
  const t = getTask(id);
  if (!t || (t.assignee_id !== user.id && user.role !== "curator")) return;
  run("UPDATE tasks SET assignee_id = NULL, status = 'open' WHERE id = ?", id);
  audit(user.id, "task.release", `task:${id}`, t.subject);
  revalidatePath("/work");
}

/** ผู้เชี่ยวชาญ (หัวหน้าทีมตรวจ) มอบงานให้คนในทีม */
export async function assignTask(formData: FormData) {
  const user = await requireRole("curator");
  const id = Number(formData.get("taskId"));
  const assignee = Number(formData.get("assigneeId")) || null;
  const target = assignee ? one<{ role: string }>("SELECT role FROM users WHERE id = ?", assignee) : null;
  const t = getTask(id);
  if (!t || (assignee && !target)) return;
  run("UPDATE tasks SET assignee_id = ?, status = ? WHERE id = ?", assignee, assignee ? "in_progress" : "open", id);
  audit(user.id, "task.assign", `task:${id}`, assignee ? `user:${assignee}` : "unassigned");
  revalidatePath("/work");
}
