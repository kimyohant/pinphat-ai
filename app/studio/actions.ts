"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit, run } from "@/lib/db";

export async function attachToLesson(formData: FormData) {
  const user = await requireRole("teacher", "curator", "collector");
  const jobId = Number(formData.get("jobId"));
  const lessonId = Number(formData.get("lessonId")) || null;
  run("UPDATE media_jobs SET lesson_id = ? WHERE id = ? AND status = 'done'", lessonId, jobId);
  audit(user.id, "studio.attach", `media:${jobId}`, lessonId ? `lesson:${lessonId}` : "detached");
  revalidatePath("/studio");
  if (lessonId) revalidatePath(`/learn/${lessonId}`);
}
