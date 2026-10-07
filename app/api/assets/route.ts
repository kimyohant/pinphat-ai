import { getUser } from "@/lib/auth";
import { audit } from "@/lib/db";
import { getSession, ingest } from "@/lib/field";

export async function POST(req: Request) {
  const user = await getUser();
  if (user.role !== "collector" && user.role !== "curator") return Response.json({ error: "เฉพาะผู้เก็บข้อมูลหรือผู้เชี่ยวชาญ" }, { status: 403 });
  const form = await req.formData();
  const session = getSession(Number(form.get("sessionId")));
  if (!session) return Response.json({ error: "ไม่พบรอบบันทึก" }, { status: 404 });
  if (!session.consent_id || session.revoked_at) return Response.json({ error: "รอบบันทึกนี้ยังไม่มีความยินยอมที่ใช้ได้ บันทึกความยินยอมก่อนอัปโหลด" }, { status: 409 });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "ยังไม่ได้เลือกไฟล์" }, { status: 400 });
  if (file.size > 500 * 1024 * 1024) return Response.json({ error: "ไฟล์ใหญ่เกิน 500 MB" }, { status: 413 });
  const r = ingest({
    sessionId: session.id,
    name: file.name,
    mime: file.type,
    buf: Buffer.from(await file.arrayBuffer()),
    contentType: String(form.get("contentType") || "performance"),
    trackLabel: String(form.get("trackLabel") || ""),
    instrumentId: Number(form.get("instrumentId")) || null,
    language: String(form.get("language") || "th"),
  });
  audit(user.id, "asset.upload", `asset:${r.assetId}`, `${file.name} sha256=${r.sha256}`);
  return Response.json({
    assetId: r.assetId,
    segmentId: r.segmentId,
    sha256: r.sha256,
    note: r.note,
    notation: r.analysis?.notation ?? null,
    confidence: r.analysis?.confidence ?? null,
    tuning: r.analysis?.tuning ?? null,
  });
}
