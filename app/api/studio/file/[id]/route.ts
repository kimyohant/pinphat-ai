import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { STUDIO_DIR, getJob } from "@/lib/studio";

/** ไฟล์สื่อที่ AI สร้าง (ใช้ประกอบบทเรียน ไม่ใช่ข้อมูลส่วนบุคคล) รองรับ Range สำหรับวิดีโอ */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(Number(id));
  if (!job?.path || job.status !== "done") return new Response("ไม่พบไฟล์", { status: 404 });
  const file = path.join(/*turbopackIgnore: true*/ STUDIO_DIR, path.basename(job.path));
  if (!fs.existsSync(file)) return new Response("ไฟล์หาย", { status: 410 });
  const size = fs.statSync(file).size;
  const headers: Record<string, string> = { "content-type": job.mime ?? "application/octet-stream", "accept-ranges": "bytes", "cache-control": "private, max-age=86400" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, "content-length": String(size) } });
}
