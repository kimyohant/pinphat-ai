"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONTENT_TYPES } from "@/lib/access";

type Instrument = { id: number; name_th: string };
type Res = { note: string; sha256: string; notation: string | null; confidence: number | null; tuning: { steps: { note: string; dev: number }[] } | null };

export function UploadAsset({ sessionId, instruments, disabled }: { sessionId: number; instruments: Instrument[]; disabled?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState("");
  const [ctype, setCtype] = useState("performance");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setRes(null);
    const fd = new FormData(e.currentTarget);
    fd.set("sessionId", String(sessionId));
    setBusy(true);
    try {
      const r = await fetch("/api/assets", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "อัปโหลดไม่สำเร็จ");
      else {
        setRes(j);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ไฟล์ยังอยู่ในเครื่องของคุณ ลองอัปโหลดใหม่เมื่อมีสัญญาณ");
    } finally {
      setBusy(false);
    }
  }

  if (disabled) return <div className="notice warn small">{disabled}</div>;

  return (
    <form onSubmit={onSubmit} className="stack">
      <label>
        ไฟล์เสียง / วิดีโอ / ภาพ
        <input id="upload-file" name="file" type="file" required accept="audio/*,video/*,image/*" />
        <span className="hint">ถอดโน้ตอัตโนมัติได้กับไฟล์ WAV · ถอดความสัมภาษณ์ได้ทุกไฟล์เสียงและวิดีโอ · ไฟล์ต้นฉบับถูกเก็บโดยไม่บีบอัด</span>
      </label>
      <div className="grid cols-3">
        <label>
          เนื้อหา
          <select id="upload-type" name="contentType" value={ctype} onChange={(e) => setCtype(e.target.value)}>
            {Object.entries(CONTENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {ctype === "interview" ? (
          <label>
            ภาษาที่พูด
            <select id="upload-lang" name="language" defaultValue="th">
              <option value="th">ไทย / อีสาน</option>
              <option value="lo">ลาว</option>
              <option value="auto">ให้ AI ตรวจเอง</option>
            </select>
          </label>
        ) : (
        <label>
          เครื่องดนตรี
          <select id="upload-inst" name="instrumentId" defaultValue="1">
            <option value="">— ไม่ระบุ —</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name_th}
              </option>
            ))}
          </select>
        </label>
        )}
        <label>
          แทร็ก / ไมค์
          <input id="upload-track" name="trackLabel" type="text" placeholder="เช่น ไมค์ 1 ระนาดเอก" />
        </label>
      </div>
      <div className="row">
        <button className="btn alt" type="submit" disabled={busy}>
          {busy ? "กำลังอัปโหลดและวิเคราะห์…" : ctype === "interview" ? "อัปโหลดและให้ AI ถอดความ" : "อัปโหลดและให้ AI วิเคราะห์"}
        </button>
        <a className="small" href="/api/sample?kind=performance">
          ไฟล์ทดสอบ: การบรรเลง
        </a>
        <a className="small" href="/api/sample?kind=tuning">
          ไฟล์ทดสอบ: ตีไล่เสียง
        </a>
      </div>
      {err && <div className="notice crit small">{err}</div>}
      {res && (
        <div className="notice ok small stack">
          <span>{res.note}</span>
          <span className="mono xs">SHA-256 {res.sha256.slice(0, 16)}…</span>
          {res.notation && <span>โน้ตที่ AI เสนอ: {res.notation}</span>}
          {res.tuning && <span>ค่าเพี้ยน (cents): {res.tuning.steps.map((s) => `${s.note} ${s.dev > 0 ? "+" : ""}${s.dev}`).join(" · ")}</span>}
        </div>
      )}
    </form>
  );
}
