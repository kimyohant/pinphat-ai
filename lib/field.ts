// การเก็บข้อมูลภาคสนาม: บันทึกไฟล์พร้อม checksum, วิเคราะห์เสียง และสร้างส่วนย่อยรอตรวจ
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MEDIA_DIR, all, now, one, run } from "./db";
import { analyzeWav } from "./audio";

export type SessionRow = {
  id: number;
  code: string;
  title: string;
  person_id: number | null;
  person: string | null;
  consent_id: number | null;
  access_level: number | null;
  tk_labels: string | null;
  revoked_at: string | null;
  province: string | null;
  district: string | null;
  place: string | null;
  recorded_on: string | null;
  collector_id: number | null;
  collector: string | null;
  checklist: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export const SESSION_SQL = `
SELECT s.*, p.display_name AS person, c.access_level, c.tk_labels, c.revoked_at, u.name AS collector
FROM sessions s
LEFT JOIN persons p ON p.id = s.person_id
LEFT JOIN consents c ON c.id = s.consent_id
LEFT JOIN users u ON u.id = s.collector_id`;

export function getSession(id: number): SessionRow | undefined {
  return one<SessionRow>(`${SESSION_SQL} WHERE s.id = ?`, id);
}

export function nextSessionCode(): string {
  const year = new Date().getFullYear();
  const last = one<{ code: string }>("SELECT code FROM sessions WHERE code LIKE ? ORDER BY code DESC LIMIT 1", `S-${year}-%`);
  const n = last ? Number(last.code.split("-")[2]) + 1 : 1;
  return `S-${year}-${String(n).padStart(3, "0")}`;
}

const EXT: Record<string, string> = { "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "video/mp4": ".mp4", "image/jpeg": ".jpg", "image/png": ".png" };

export function saveFile(sessionId: number, name: string, mime: string, buf: Buffer): { rel: string; sha: string } {
  const dir = path.join(/*turbopackIgnore: true*/ MEDIA_DIR, String(sessionId));
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(name).toLowerCase() || EXT[mime] || ".bin";
  const file = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir, file), buf);
  return { rel: path.join(/*turbopackIgnore: true*/ String(sessionId), file), sha: crypto.createHash("sha256").update(buf).digest("hex") };
}

export function kindOf(mime: string, name: string): "audio" | "video" | "image" | "doc" {
  if (mime.startsWith("audio/") || /\.(wav|mp3|m4a|flac|ogg)$/i.test(name)) return "audio";
  if (mime.startsWith("video/") || /\.(mp4|mov|mkv)$/i.test(name)) return "video";
  if (mime.startsWith("image/")) return "image";
  return "doc";
}

export type IngestResult = { assetId: number; segmentId: number | null; sha256: string; analysis: ReturnType<typeof analyzeWav> | null; note: string };

/** รับไฟล์เข้าคลัง: เก็บต้นฉบับ คำนวณ SHA-256 วิเคราะห์ (ถ้าเป็น WAV) แล้วสร้างส่วนย่อยรอผู้เชี่ยวชาญตรวจ */
export function ingest(opts: {
  sessionId: number;
  name: string;
  mime: string;
  buf: Buffer;
  contentType: string;
  trackLabel: string;
  instrumentId: number | null;
}): IngestResult {
  const kind = kindOf(opts.mime, opts.name);
  const f = saveFile(opts.sessionId, opts.name, opts.mime, opts.buf);
  const isWav = /wav/i.test(opts.mime) || /\.wav$/i.test(opts.name);
  const analysis = kind === "audio" && isWav ? analyzeWav(opts.buf, opts.contentType) : null;
  const asset = run(
    "INSERT INTO assets (session_id, kind, content_type, track_label, instrument_id, filename, path, mime, size, sha256, duration_s, analysis, fixity_checked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    opts.sessionId,
    kind,
    opts.contentType,
    opts.trackLabel,
    opts.instrumentId,
    opts.name,
    f.rel,
    opts.mime || "application/octet-stream",
    opts.buf.length,
    f.sha,
    analysis?.durationSec ?? null,
    analysis ? JSON.stringify({ peaks: analysis.peaks, durationSec: analysis.durationSec, sampleRate: analysis.sampleRate }) : null,
    now(),
    now(),
  );
  let segmentId: number | null = null;
  let note = "เก็บไฟล์ต้นฉบับแล้ว";
  if (kind === "audio" || kind === "video") {
    segmentId = run(
      "INSERT INTO segments (session_id, asset_id, kind, start_ms, end_ms, instrument_id, ai_suggestion, ai_confidence, status, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?)",
      opts.sessionId,
      asset.id,
      opts.contentType === "photo" || opts.contentType === "other" ? "performance" : opts.contentType,
      analysis ? Math.round(analysis.durationSec * 1000) : null,
      opts.instrumentId,
      analysis ? JSON.stringify(analysis) : null,
      analysis?.confidence ?? null,
      now(),
    ).id;
    note = analysis
      ? opts.contentType === "tuning"
        ? `วัดระบบเสียงได้ ${analysis.tuning?.steps.length ?? 0} ลูก ส่งเข้าคิวตรวจรับรองแล้ว`
        : `AI พบ ${analysis.notes.length} โน้ต ความมั่นใจ ${Math.round(analysis.confidence * 100)}% ส่งเข้าคิวตรวจรับรองแล้ว`
      : "ต้นแบบนี้วิเคราะห์อัตโนมัติได้เฉพาะไฟล์ WAV ไฟล์นี้ส่งเข้าคิวให้ผู้เชี่ยวชาญถอดโน้ตเอง";
  }
  return { assetId: asset.id, segmentId, sha256: f.sha, analysis, note };
}

/** ตรวจความสมบูรณ์ของไฟล์ (fixity) โดยคำนวณ SHA-256 ใหม่เทียบกับค่าที่บันทึกไว้ */
export function checkFixity(sessionId: number): { id: number; filename: string; ok: boolean }[] {
  const assets = all<{ id: number; filename: string; path: string; sha256: string }>("SELECT id, filename, path, sha256 FROM assets WHERE session_id = ?", sessionId);
  return assets.map((a) => {
    const p = path.join(/*turbopackIgnore: true*/ MEDIA_DIR, a.path);
    const ok = fs.existsSync(p) && crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") === a.sha256;
    if (ok) run("UPDATE assets SET fixity_checked_at = ? WHERE id = ?", now(), a.id);
    return { id: a.id, filename: a.filename, ok };
  });
}
