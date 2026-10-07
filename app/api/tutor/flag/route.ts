import { getUser } from "@/lib/auth";
import { audit, now, run } from "@/lib/db";
import { createTask } from "@/lib/tasks";

export async function POST(req: Request) {
  const user = await getUser();
  const b = (await req.json()) as { question: string; answer: string; note?: string };
  const r = run(
    "INSERT INTO tutor_flags (user_id, question, answer, note, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
    user.id,
    String(b.question ?? "").slice(0, 1000),
    String(b.answer ?? "").slice(0, 4000),
    String(b.note ?? "").slice(0, 500),
    now(),
  );
  audit(user.id, "tutor.flag", `flag:${r.id}`);
  createTask({ type: "tutor_flag", subject: `flag:${r.id}`, title: String(b.question ?? "").slice(0, 120), role: "curator", createdBy: user.id });
  return Response.json({ ok: true });
}
