import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getUser } from "@/lib/auth";
import { canSee } from "@/lib/access";
import { MEDIA_DIR, one } from "@/lib/db";

type Row = { path: string; mime: string; size: number; collector_id: number | null; access_level: number | null; revoked_at: string | null };

/** ส่งไฟล์เสียง/วิดีโอ ตรวจสิทธิ์ตามความยินยอมของรอบบันทึก และรองรับ Range เพื่อเลื่อนเล่นได้ */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const a = one<Row>(
    `SELECT a.path, a.mime, a.size, s.collector_id, c.access_level, c.revoked_at
     FROM assets a JOIN sessions s ON s.id = a.session_id LEFT JOIN consents c ON c.id = s.consent_id WHERE a.id = ?`,
    Number(id),
  );
  if (!a) return new Response("ไม่พบไฟล์", { status: 404 });
  const allowed = !a.revoked_at && (canSee(user.role, a.access_level) || user.role === "curator" || (user.role === "collector" && a.collector_id === user.id));
  if (!allowed) return new Response("ไม่มีสิทธิ์เข้าถึงไฟล์นี้", { status: 403 });
  const file = path.join(/*turbopackIgnore: true*/ MEDIA_DIR, a.path);
  if (!file.startsWith(MEDIA_DIR) || !fs.existsSync(file)) return new Response("ไฟล์หายจากคลัง", { status: 410 });
  const size = fs.statSync(file).size;
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  const headers: Record<string, string> = { "content-type": a.mime, "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
}
