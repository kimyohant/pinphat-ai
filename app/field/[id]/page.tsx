import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { CHECKLIST } from "@/lib/access";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { Icon } from "@/components/ui/Icon";
import { asrState, getSession } from "@/lib/field";
import { dur, json, pct } from "@/lib/format";
import { AccessBadge } from "@/components/AccessBadge";
import { UploadAsset } from "@/components/UploadAsset";
import { Waveform } from "@/components/Waveform";
import { addTranscript, retranscribe, runFixity, submitSession, toggleCheck } from "../actions";
import { AutoRefresh } from "@/components/AutoRefresh";

type Asset = { id: number; kind: string; content_type: string; track_label: string | null; filename: string; size: number; sha256: string; duration_s: number | null; analysis: string | null; fixity_checked_at: string | null; instrument: string | null };
type Seg = { id: number; kind: string; status: string; ai_confidence: number | null; transcript: string | null; asset_id: number | null; ai_suggestion: string | null };


export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("collector", "curator");
  const { t, locale } = await getT();
  const thDate = (d: string | null | undefined) => fmtDate(d, locale);
  const CONTENT_TYPES = t.contentTypes as Record<string, string>;
  const TK = t.tk as Record<string, string>;
  const CHECK = t.checklist as Record<string, string>;
  const SEG_STATUS: Record<string, [string, string]> = { pending: [t.fieldDetail.pending, "warn"], approved: [t.fieldDetail.approved, "ok"], rejected: [t.fieldDetail.rejected, "crit"] };
  const s = getSession(Number(id));
  if (!s) notFound();
  const assets = all<Asset>("SELECT a.*, i.name_th AS instrument FROM assets a LEFT JOIN instruments i ON i.id = a.instrument_id WHERE session_id = ? ORDER BY a.id", s.id);
  const segs = all<Seg>("SELECT id, kind, status, ai_confidence, transcript, asset_id, ai_suggestion FROM segments WHERE session_id = ? ORDER BY id", s.id);
  const instruments = all<{ id: number; name_th: string }>("SELECT id, name_th FROM instruments ORDER BY id");
  const check = json<Record<string, boolean>>(s.checklist, {});
  const labels = json<string[]>(s.tk_labels, []);
  const missing = CHECKLIST.filter((c) => c.required && !check[c.key]);
  const canSubmit = s.status === "draft" && segs.length > 0;
  const asr = new Map(segs.map((g) => [g.id, asrState(g.ai_suggestion, g.id)]));
  const transcribing = [...asr.values()].some((a) => a?.status === "running");

  return (
    <main id="main" className="page">
      <div className="page-head">
        <Link href="/field" className="small">
          <Icon name="back" size={16} />
          {t.fieldNew.back}
        </Link>
        <div className="row">
          <span className="mono muted">{s.code}</span>
          <h1>{s.title}</h1>
        </div>
        <div className="row small muted">
          <span>{s.person}</span>
          <span>
            {s.place} · {s.district} · {s.province}
          </span>
          <span>{thDate(s.recorded_on)}</span>
          <span>{fmt(t.fieldDetail.recordedBy, { name: s.collector ?? "-" })}</span>
        </div>
      </div>

      {transcribing && <AutoRefresh seconds={5} />}
      <div className="split">
        <div className="stack-lg">
          <section className="card">
            <div className="row between">
              <h2>{t.fieldDetail.files}</h2>
              <form action={runFixity.bind(null, s.id)}>
                <button className="btn ghost sm" type="submit">
                  {t.fieldDetail.fixity}
                </button>
              </form>
            </div>
            {assets.length === 0 && <div className="empty">{t.fieldDetail.noFiles}</div>}
            {assets.map((a) => {
              const an = json<{ peaks?: number[] }>(a.analysis, {});
              return (
                <div key={a.id} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s3)" }}>
                  <div className="row between">
                    <div>
                      <b>{a.track_label || a.filename}</b>{" "}
                      <span className="badge">{CONTENT_TYPES[a.content_type] ?? a.content_type}</span> {a.instrument && <span className="badge l2">{a.instrument}</span>}
                    </div>
                    <span className="mono xs muted">
                      {dur(a.duration_s)} · {(a.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  {an.peaks && <Waveform peaks={an.peaks} />}
                  {a.kind === "audio" && <audio controls preload="none" src={`/api/media/${a.id}`} />}
                  <div className="row xs muted">
                    <span className="mono">SHA-256 {a.sha256.slice(0, 20)}…</span>
                    <span>{fmt(t.fieldDetail.lastCheck, { date: thDate(a.fixity_checked_at) })}</span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card">
            <h2>{t.fieldDetail.upload}</h2>
            <UploadAsset
              sessionId={s.id}
              instruments={instruments}
              disabled={s.revoked_at ? t.fieldDetail.revokedNoUpload : !s.consent_id ? t.fieldDetail.needConsent : undefined}
            />
          </section>

          <section className="card">
            <h2>{t.fieldDetail.transcribe}</h2>
            <p className="small muted">{t.fieldDetail.transcribeLede}</p>
            <form action={addTranscript} className="stack">
              <input type="hidden" name="sessionId" value={s.id} />
              <textarea id="transcript" name="transcript" placeholder={t.fieldDetail.transcriptPh} />
              <button className="btn ghost" type="submit">
                {t.fieldDetail.sendTranscript}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>{t.fieldDetail.segments}</h2>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.curate.colType}</th>
                    <th className="num">{t.curate.colConf}</th>
                    <th>{t.field.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {segs.map((g) => (
                    <tr key={g.id}>
                      <td className="mono">{g.id}</td>
                      <td>
                        {CONTENT_TYPES[g.kind] ?? g.kind}
                        {asr.get(g.id)?.status === "running" && <span className="badge l2">{t.fieldDetail.asrRunning}</span>}
                        {asr.get(g.id)?.status === "done" && <span className="badge ok">{fmt(t.fieldDetail.asrDone, { n: asr.get(g.id)?.seconds ?? 0 })}</span>}
                        {asr.get(g.id)?.status === "failed" && <span className="badge crit">{fmt(t.fieldDetail.asrFailed, { error: asr.get(g.id)?.error ?? "" })}</span>}
                        {g.transcript && <div className="xs muted">{g.transcript.slice(0, 120)}…</div>}
                        {g.kind === "interview" && g.asset_id && g.status === "pending" && asr.get(g.id)?.status !== "running" && (
                          <form action={retranscribe.bind(null, g.id, s.id, asr.get(g.id)?.language ?? "th")}>
                            <button className="btn ghost sm" type="submit">
                              {g.transcript ? t.fieldDetail.retranscribe : t.fieldDetail.transcribeAi}
                            </button>
                          </form>
                        )}
                      </td>
                      <td className="num">{pct(g.ai_confidence)}</td>
                      <td>
                        <span className={`badge ${SEG_STATUS[g.status]?.[1]}`}>{SEG_STATUS[g.status]?.[0] ?? g.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="stack-lg">
          <section className="card">
            <h3>{t.field.colConsent}</h3>
            <AccessBadge level={s.access_level} revoked={!!s.revoked_at} />
            <div className="row">
              {labels.map((l) => (
                <span key={l} className="badge" title={TK[l]}>
                  {l}
                </span>
              ))}
            </div>
            <Link className="small" href="/consent">
              {t.fieldDetail.manageConsent}
            </Link>
          </section>
          <section className="card">
            <h3>{t.fieldDetail.checklist}</h3>
            {CHECKLIST.map((c) => (
              <form key={c.key} action={toggleCheck.bind(null, s.id, c.key)}>
                <button type="submit" className="btn ghost sm" style={{ width: "100%", justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }}>
                  <span style={{ color: check[c.key] ? "var(--ok)" : "var(--ink-3)", display: "inline-flex" }}>{check[c.key] ? <Icon name="check" size={16} /> : "○"}</span> {CHECK[c.key] ?? c.label}
                  {c.required && !check[c.key] && <span className="badge warn">{t.fieldDetail.required}</span>}
                </button>
              </form>
            ))}
          </section>
          <section className="card">
            <h3>{t.fieldDetail.submitTitle}</h3>
            {s.status === "submitted" ? (
              <span className="badge ok">{t.fieldDetail.submitted}</span>
            ) : (
              <>
                {missing.length > 0 && <p className="small" style={{ color: "var(--warn)" }}>{fmt(t.fieldDetail.missing, { items: missing.map((m) => CHECK[m.key] ?? m.label).join(", ") })}</p>}
                <form action={submitSession.bind(null, s.id)}>
                  <button className="btn" type="submit" disabled={!canSubmit}>
                    {t.fieldDetail.submit}
                  </button>
                </form>
                {segs.length === 0 && <p className="xs muted">{t.fieldDetail.needOne}</p>}
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
