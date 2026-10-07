// สตูดิโอสื่อการสอน: สร้างรูปและวิดีโอประกอบบทเรียนด้วยโมเดลบนเซิร์ฟเวอร์ Unsloth
// สื่อที่ AI สร้างเก็บแยกจากคลังบันทึกจริง ไม่เข้าดัชนีความรู้ และติดป้าย "สร้างโดย AI" ทุกครั้งที่แสดง
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR, all, now, one, run } from "./db";
import { chat, createVideo, ensureModel, generateImage, getVideo, gpuBusy, videoContent, withGpu, UnslothError } from "./unsloth";

export const STUDIO_DIR = path.join(DATA_DIR, "studio");

export type MediaJob = {
  id: number;
  kind: "image" | "video";
  prompt_th: string | null;
  prompt: string;
  size: string;
  seconds: number | null;
  status: "queued" | "loading" | "running" | "done" | "failed";
  progress: number;
  remote_id: string | null;
  path: string | null;
  mime: string | null;
  error: string | null;
  lesson_id: number | null;
  lesson_title?: string | null;
  created_by: number;
  creator?: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export const IMAGE_SIZES = ["1024x768", "768x1024", "1024x1024", "1280x720"];
export const VIDEO_SIZES = ["1280x704", "704x1280"];

const g = globalThis as unknown as { __pinphatJobs?: Set<number> };
const active = (g.__pinphatJobs ??= new Set<number>());

function update(id: number, fields: Partial<Record<keyof MediaJob, string | number | null>>) {
  const keys = Object.keys(fields);
  run(`UPDATE media_jobs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => fields[k as keyof MediaJob] ?? null), id);
}

/** งานที่ค้างจากการรีสตาร์ตเซิร์ฟเวอร์ (ไม่มีใครดูแลแล้ว) ให้ปิดเป็นล้มเหลว */
function recover() {
  for (const j of all<{ id: number }>("SELECT id FROM media_jobs WHERE status IN ('queued', 'loading', 'running')")) {
    if (!active.has(j.id)) update(j.id, { status: "failed", error: "เซิร์ฟเวอร์แอปรีสตาร์ตระหว่างสร้าง กดสร้างใหม่ได้", finished_at: now() });
  }
}

export function listJobs(limit = 40): MediaJob[] {
  recover();
  return all<MediaJob>(
    `SELECT j.*, l.title AS lesson_title, u.name AS creator FROM media_jobs j
     LEFT JOIN lessons l ON l.id = j.lesson_id LEFT JOIN users u ON u.id = j.created_by
     ORDER BY j.id DESC LIMIT ?`,
    limit,
  );
}

export function getJob(id: number): MediaJob | undefined {
  return one<MediaJob>("SELECT j.*, l.title AS lesson_title FROM media_jobs j LEFT JOIN lessons l ON l.id = j.lesson_id WHERE j.id = ?", id);
}

export function lessonMedia(lessonId: number): MediaJob[] {
  return all<MediaJob>("SELECT * FROM media_jobs WHERE lesson_id = ? AND status = 'done' ORDER BY id", lessonId);
}

function save(id: number, buf: Buffer, ext: string): string {
  fs.mkdirSync(STUDIO_DIR, { recursive: true });
  const name = `${id}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ STUDIO_DIR, name), buf);
  return name;
}

async function runJob(id: number) {
  const job = getJob(id);
  if (!job) return;
  active.add(id);
  try {
    await withGpu(`media:${id}`, async () => {
      update(id, { status: "loading", started_at: now() });
      await ensureModel(job.kind, { waitIfBusy: true });
      update(id, { status: "running" });
      if (job.kind === "image") {
        const png = await generateImage(job.prompt, job.size);
        update(id, { status: "done", progress: 100, path: save(id, png, ".png"), mime: "image/png", finished_at: now() });
        return;
      }
      const v = await createVideo(job.prompt, job.seconds ?? 3, job.size);
      update(id, { remote_id: v.id });
      const t0 = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000));
        const s = await getVideo(v.id);
        update(id, { progress: s.progress ?? 0 });
        if (s.status === "completed") break;
        if (s.status === "failed") throw new UnslothError(s.error?.message ?? "สร้างวิดีโอไม่สำเร็จ");
        if (Date.now() - t0 > 60 * 60_000) throw new UnslothError("สร้างวิดีโอนานเกิน 1 ชั่วโมง");
      }
      const mp4 = await videoContent(v.id);
      update(id, { status: "done", progress: 100, path: save(id, mp4, ".mp4"), mime: "video/mp4", finished_at: now() });
    });
  } catch (e) {
    update(id, { status: "failed", error: e instanceof Error ? e.message : String(e), finished_at: now() });
  } finally {
    active.delete(id);
  }
}

export function createJob(input: { kind: "image" | "video"; promptTh: string; prompt: string; size: string; seconds: number | null; lessonId: number | null; userId: number }): number {
  const id = run(
    "INSERT INTO media_jobs (kind, prompt_th, prompt, size, seconds, status, progress, lesson_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)",
    input.kind,
    input.promptTh,
    input.prompt,
    input.size,
    input.seconds,
    input.lessonId,
    input.userId,
    now(),
  ).id;
  active.add(id);
  void runJob(id);
  return id;
}

const PROMPT_SYSTEM = `You write prompts for an image or video generation model that illustrates lessons about traditional Lanchang (Lao / Northeast Thai) pinphat ensemble music for Thai school students.
Rewrite the teacher's Thai description as one English prompt of 40-80 words.
- Describe instruments, setting, lighting, camera and style concretely. Use real instrument names (ranat ek xylophone, khong wong gong circle, pi oboe, ching cymbals, drums) when they appear.
- Never depict a specific real, identifiable person; use generic performers or only hands.
- Do not depict religious ceremonies or sacred rites.
- For video, describe one simple continuous motion and camera move.
Output only the English prompt, no quotes or explanations.`;

/** ใช้โมเดลภาษาช่วยแปลงคำอธิบายภาษาไทยเป็น prompt ภาษาอังกฤษ (โมเดลรูปและวิดีโอเข้าใจภาษาอังกฤษดีกว่า) */
export async function draftPrompt(textTh: string, kind: "image" | "video"): Promise<string> {
  const busy = gpuBusy();
  if (busy?.startsWith("media")) throw new UnslothError("เซิร์ฟเวอร์ AI กำลังสร้างสื่ออยู่ เขียน prompt เองได้ หรือรอให้งานเสร็จก่อน", 409);
  return withGpu("prompt", async () => {
    await ensureModel("text");
    const out = await chat(
      [
        { role: "system", content: PROMPT_SYSTEM },
        { role: "user", content: `${kind === "video" ? "Video" : "Image"} description (Thai): ${textTh}` },
      ],
      300,
    );
    return out.replace(/^["'\s]+|["'\s]+$/g, "");
  });
}
