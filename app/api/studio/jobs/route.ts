import { getUser } from "@/lib/auth";
import { audit } from "@/lib/db";
import { IMAGE_SIZES, VIDEO_SIZES, createJob, listJobs } from "@/lib/studio";
import { unslothEnabled } from "@/lib/unsloth";

const ROLES = ["teacher", "curator", "collector"];

export async function GET() {
  const user = await getUser();
  if (!ROLES.includes(user.role)) return Response.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  return Response.json({ jobs: listJobs() });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!ROLES.includes(user.role)) return Response.json({ error: "สตูดิโอสื่อใช้ได้เฉพาะครู ผู้เก็บข้อมูล และผู้เชี่ยวชาญ" }, { status: 403 });
  if (!unslothEnabled()) return Response.json({ error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ Unsloth" }, { status: 503 });
  const b = (await req.json()) as { kind: string; promptTh?: string; prompt?: string; size?: string; seconds?: number; lessonId?: number | null };
  const kind = b.kind === "video" ? "video" : "image";
  const prompt = String(b.prompt ?? "").trim();
  if (prompt.length < 8) return Response.json({ error: "เขียน prompt อย่างน้อยหนึ่งประโยค" }, { status: 400 });
  const sizes = kind === "video" ? VIDEO_SIZES : IMAGE_SIZES;
  const size = sizes.includes(String(b.size)) ? String(b.size) : sizes[0];
  const seconds = kind === "video" ? Math.min(5, Math.max(1, Number(b.seconds) || 3)) : null;
  const id = createJob({ kind, promptTh: String(b.promptTh ?? "").slice(0, 2000), prompt: prompt.slice(0, 2000), size, seconds, lessonId: Number(b.lessonId) || null, userId: user.id });
  audit(user.id, `studio.${kind}`, `media:${id}`, prompt.slice(0, 200));
  return Response.json({ id });
}
