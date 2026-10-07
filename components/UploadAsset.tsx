"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";

type Instrument = { id: number; name_th: string };
type Res = { note: string; sha256: string; notation: string | null; confidence: number | null; tuning: { steps: { note: string; dev: number }[] } | null };

export function UploadAsset({ sessionId, instruments, disabled }: { sessionId: number; instruments: Instrument[]; disabled?: string }) {
  const router = useRouter();
  const { t: T } = useT();
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
      if (!r.ok) setErr(j.error ?? T.upload.failed);
      else {
        setRes(j);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    } catch {
      setErr(T.upload.offline);
    } finally {
      setBusy(false);
    }
  }

  if (disabled) return <div className="notice warn small">{disabled}</div>;

  return (
    <form onSubmit={onSubmit} className="stack">
      <label>
        {T.upload.file}
        <input id="upload-file" name="file" type="file" required accept="audio/*,video/*,image/*" />
        <span className="hint">{T.upload.fileHint}</span>
      </label>
      <div className="grid cols-3">
        <label>
          {T.upload.content}
          <select id="upload-type" name="contentType" value={ctype} onChange={(e) => setCtype(e.target.value)}>
            {Object.entries(T.contentTypes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {ctype === "interview" ? (
          <label>
            {T.upload.spoken}
            <select id="upload-lang" name="language" defaultValue="th">
              <option value="th">{T.upload.langTh}</option>
              <option value="lo">{T.upload.langLo}</option>
              <option value="auto">{T.upload.langAuto}</option>
            </select>
          </label>
        ) : (
        <label>
          {T.upload.instrument}
          <select id="upload-inst" name="instrumentId" defaultValue="1">
            <option value="">{T.review.unspecified}</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name_th}
              </option>
            ))}
          </select>
        </label>
        )}
        <label>
          {T.upload.track}
          <input id="upload-track" name="trackLabel" type="text" placeholder={T.upload.trackPh} />
        </label>
      </div>
      <div className="row">
        <button className="btn alt" type="submit" disabled={busy}>
          {busy ? T.upload.busy : ctype === "interview" ? T.upload.goAsr : T.upload.goAnalyse}
        </button>
        <a className="small" href="/api/sample?kind=performance">
          {T.upload.samplePerf}
        </a>
        <a className="small" href="/api/sample?kind=tuning">
          {T.upload.sampleTuning}
        </a>
      </div>
      {err && <div className="notice crit small">{err}</div>}
      {res && (
        <div className="notice ok small stack">
          <span>{res.note}</span>
          <span className="mono xs">SHA-256 {res.sha256.slice(0, 16)}…</span>
          {res.notation && <span>{fmt(T.upload.proposed, { n: res.notation })}</span>}
          {res.tuning && <span>{fmt(T.upload.deviation, { v: res.tuning.steps.map((s) => `${s.note} ${s.dev > 0 ? "+" : ""}${s.dev}`).join(" · ") })}</span>}
        </div>
      )}
    </form>
  );
}
