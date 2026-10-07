// การเก็บข้อมูลภาคสนาม: บันทึกไฟล์พร้อม checksum, วิเคราะห์เสียง และสร้างส่วนย่อยรอตรวจ
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MEDIA_DIR, all, now, one, run } from "./db";
import { analyzeWav } from "./audio";
import { STT_MODEL, transcribe, unslothEnabled } from "./unsloth";
import { createTask } from "./tasks";

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
  language?: string;
}): IngestResult {
  const isInterview = opts.contentType === "interview";
  const kind = kindOf(opts.mime, opts.name);
  const f = saveFile(opts.sessionId, opts.name, opts.mime, opts.buf);
  const isWav = /wav/i.test(opts.mime) || /\.wav$/i.test(opts.name);
  // บทสัมภาษณ์ใช้ผลวิเคราะห์เฉพาะความยาวและรูปคลื่น ไม่ต้องถอดโน้ต
  const analysis = kind === "audio" && isWav ? analyzeWav(opts.buf, isInterview ? "interview" : opts.contentType) : null;
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
      isInterview ? null : analysis ? JSON.stringify(analysis) : null,
      isInterview ? null : (analysis?.confidence ?? null),
      now(),
    ).id;
    if (!isInterview) {
      // ร่างโน้ตจาก AI เก็บไว้เทียบกับฉบับที่ผู้เชี่ยวชาญรับรอง
      if (analysis?.notation) run("UPDATE segments SET ai_draft = ? WHERE id = ?", analysis.notation, segmentId);
      createTask({ type: "review_notation", subject: `segment:${segmentId}`, title: `${sessionCode(segmentId)} #${segmentId}`, role: "curator" });
    }
    if (isInterview) {
      const started = startTranscription(segmentId, opts.language);
      if (!started) transcriptTask(segmentId);
      return { assetId: asset.id, segmentId, sha256: f.sha, analysis: null, note: started ? "AI กำลังถอดความบทสัมภาษณ์ ร่างจะเข้าคิวให้ผู้เชี่ยวชาญตรวจแก้" : "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ถอดเสียง ส่งเข้าคิวให้ถอดความเองแล้ว" };
    }
    note = analysis
      ? opts.contentType === "tuning"
        ? `วัดระบบเสียงได้ ${analysis.tuning?.steps.length ?? 0} ลูก ส่งเข้าคิวตรวจรับรองแล้ว`
        : `AI พบ ${analysis.notes.length} โน้ต ความมั่นใจ ${Math.round(analysis.confidence * 100)}% ส่งเข้าคิวตรวจรับรองแล้ว`
      : "ต้นแบบนี้วิเคราะห์อัตโนมัติได้เฉพาะไฟล์ WAV ไฟล์นี้ส่งเข้าคิวให้ผู้เชี่ยวชาญถอดโน้ตเอง";
  }
  return { assetId: asset.id, segmentId, sha256: f.sha, analysis, note };
}

// ---------- ถอดความบทสัมภาษณ์ ----------

export type AsrState = { status: "running" | "done" | "failed"; model: string; language: string | null; error?: string; seconds?: number; at: string };

const g = globalThis as unknown as { __pinphatAsr?: Set<number> };
const asrActive = (g.__pinphatAsr ??= new Set<number>());

export function asrState(aiSuggestion: string | null, segmentId: number): AsrState | null {
  if (!aiSuggestion) return null;
  try {
    const s = (JSON.parse(aiSuggestion) as { asr?: AsrState }).asr ?? null;
    // งานที่ค้างจากการรีสตาร์ตเซิร์ฟเวอร์แอป
    if (s?.status === "running" && !asrActive.has(segmentId)) return { ...s, status: "failed", error: "ถูกขัดจังหวะ กดถอดความใหม่ได้" };
    return s;
  } catch {
    return null;
  }
}

function sessionCode(segmentId: number): string {
  return one<{ code: string }>("SELECT s.code FROM segments sg JOIN sessions s ON s.id = sg.session_id WHERE sg.id = ?", segmentId)?.code ?? "";
}

/** งานแก้คำถอดความ: ข้อมูลระดับชุมชนเท่านั้นหรือระดับปิดส่งให้ผู้เชี่ยวชาญ ที่เหลือส่งให้ผู้ช่วยวิจัย */
function transcriptTask(segmentId: number, note = "") {
  const r = one<{ access_level: number | null }>(
    "SELECT c.access_level FROM segments sg JOIN sessions s ON s.id = sg.session_id LEFT JOIN consents c ON c.id = s.consent_id WHERE sg.id = ?",
    segmentId,
  );
  createTask({ type: "review_transcript", subject: `segment:${segmentId}`, title: `${sessionCode(segmentId)} #${segmentId}${note}`, role: (r?.access_level ?? 5) >= 4 ? "curator" : "assistant" });
}

/** ถอดความไฟล์เสียงของส่วนย่อยแบบเบื้องหลัง ผลเป็นร่างที่ต้องผ่านผู้เชี่ยวชาญก่อนเข้าคลังความรู้ */
export function startTranscription(segmentId: number, language = "th"): boolean {
  if (!unslothEnabled() || asrActive.has(segmentId)) return false;
  const a = one<{ path: string; filename: string; mime: string }>(
    "SELECT a.path, a.filename, a.mime FROM segments sg JOIN assets a ON a.id = sg.asset_id WHERE sg.id = ?",
    segmentId,
  );
  if (!a) return false;
  const lang = language === "auto" ? null : language;
  const set = (s: AsrState) => run("UPDATE segments SET ai_suggestion = ? WHERE id = ?", JSON.stringify({ asr: s }), segmentId);
  set({ status: "running", model: STT_MODEL, language: lang, at: now() });
  asrActive.add(segmentId);
  const t0 = Date.now();
  void (async () => {
    try {
      const buf = fs.readFileSync(path.join(/*turbopackIgnore: true*/ MEDIA_DIR, a.path));
      const r = await transcribe(buf, a.filename, a.mime, language);
      run("UPDATE segments SET transcript = ?, ai_draft = ? WHERE id = ? AND status = 'pending'", r.text, r.text, segmentId);
      transcriptTask(segmentId);
      set({ status: "done", model: STT_MODEL, language: r.language ?? lang, seconds: Math.round((Date.now() - t0) / 1000), at: now() });
    } catch (e) {
      set({ status: "failed", model: STT_MODEL, language: lang, error: e instanceof Error ? e.message : String(e), at: now() });
      transcriptTask(segmentId, " · ASR ✗");
    } finally {
      asrActive.delete(segmentId);
    }
  })();
  return true;
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
