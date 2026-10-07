"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit, now, one, run } from "@/lib/db";

export async function assignLesson(formData: FormData) {
  const user = await requireRole("teacher", "curator");
  const lessonId = Number(formData.get("lessonId"));
  const due = String(formData.get("dueOn") ?? "");
  if (!lessonId || !due) return;
  run("INSERT INTO assignments (teacher_id, lesson_id, class_name, due_on, created_at) VALUES (?, ?, ?, ?, ?)", user.id, lessonId, user.class_name ?? "ม.2/1", due, now());
  audit(user.id, "assignment.create", `lesson:${lessonId}`, due);
  revalidatePath("/teach");
}

export async function lessonFromSegment(formData: FormData) {
  const user = await requireRole("teacher", "curator");
  const segId = Number(formData.get("segmentId"));
  const sg = one<{ notation: string | null; instrument_id: number | null; ai_suggestion: string | null }>(
    "SELECT notation, instrument_id, ai_suggestion FROM segments WHERE id = ? AND status = 'approved'",
    segId,
  );
  if (!sg?.notation) return;
  const ai = sg.ai_suggestion ? (JSON.parse(sg.ai_suggestion) as { slotSec?: number; baseHz?: number }) : {};
  const id = run(
    "INSERT INTO lessons (title, grade, indicator, description, segment_id, instrument_id, notation, tempo, difficulty, base_hz, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    String(formData.get("title") || "บทเรียนใหม่"),
    String(formData.get("grade") || ""),
    String(formData.get("indicator") || ""),
    String(formData.get("description") || ""),
    segId,
    sg.instrument_id ?? 1,
    sg.notation,
    ai.slotSec ? Math.round(60 / ai.slotSec) : 140,
    Number(formData.get("difficulty")) || 2,
    ai.baseHz ?? null,
    user.id,
    now(),
  ).id;
  audit(user.id, "lesson.create", `lesson:${id}`, `from segment ${segId}`);
  revalidatePath("/teach");
  revalidatePath("/learn");
}
