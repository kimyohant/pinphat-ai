import { getUser } from "@/lib/auth";
import { now, run } from "@/lib/db";

export async function POST(req: Request) {
  const user = await getUser();
  if (user.role !== "student") return Response.json({ error: "บันทึกผลได้เฉพาะบัญชีนักเรียน" }, { status: 403 });
  const b = (await req.json()) as { lessonId: number; mode: string; speed: number; accuracy: number; timingMs: number; barErrors: number[] };
  if (!Number.isFinite(b.lessonId) || !Number.isFinite(b.accuracy)) return Response.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  run(
    "INSERT INTO practice_attempts (user_id, lesson_id, mode, speed, accuracy, timing_ms, bar_errors, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    user.id,
    b.lessonId,
    b.mode === "mic" ? "mic" : "keys",
    b.speed,
    Math.max(0, Math.min(1, b.accuracy)),
    b.timingMs,
    JSON.stringify((b.barErrors ?? []).slice(0, 64)),
    now(),
  );
  return Response.json({ ok: true });
}
