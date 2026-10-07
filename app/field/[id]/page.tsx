import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { CHECKLIST, CONTENT_TYPES, TK_LABELS } from "@/lib/access";
import { getSession } from "@/lib/field";
import { dur, json, pct, thDate } from "@/lib/format";
import { AccessBadge } from "@/components/AccessBadge";
import { UploadAsset } from "@/components/UploadAsset";
import { Waveform } from "@/components/Waveform";
import { addTranscript, runFixity, submitSession, toggleCheck } from "../actions";

type Asset = { id: number; kind: string; content_type: string; track_label: string | null; filename: string; size: number; sha256: string; duration_s: number | null; analysis: string | null; fixity_checked_at: string | null; instrument: string | null };
type Seg = { id: number; kind: string; status: string; ai_confidence: number | null; transcript: string | null; asset_id: number | null };

const SEG_STATUS: Record<string, [string, string]> = { pending: ["รอตรวจ", "warn"], approved: ["รับรองแล้ว", "ok"], rejected: ["ไม่ผ่าน", "crit"] };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("collector", "curator");
  const s = getSession(Number(id));
  if (!s) notFound();
  const assets = all<Asset>("SELECT a.*, i.name_th AS instrument FROM assets a LEFT JOIN instruments i ON i.id = a.instrument_id WHERE session_id = ? ORDER BY a.id", s.id);
  const segs = all<Seg>("SELECT id, kind, status, ai_confidence, transcript, asset_id FROM segments WHERE session_id = ? ORDER BY id", s.id);
  const instruments = all<{ id: number; name_th: string }>("SELECT id, name_th FROM instruments ORDER BY id");
  const check = json<Record<string, boolean>>(s.checklist, {});
  const labels = json<string[]>(s.tk_labels, []);
  const missing = CHECKLIST.filter((c) => c.required && !check[c.key]);
  const canSubmit = s.status === "draft" && segs.length > 0;

  return (
    <main className="page">
      <div className="page-head">
        <Link href="/field" className="small">
          ← รอบบันทึกทั้งหมด
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
          <span>บันทึกโดย {s.collector}</span>
        </div>
      </div>

      <div className="split">
        <div className="stack-lg">
          <section className="card">
            <div className="row between">
              <h2>ไฟล์ในรอบนี้</h2>
              <form action={runFixity.bind(null, s.id)}>
                <button className="btn ghost sm" type="submit">
                  ตรวจความสมบูรณ์ไฟล์ (SHA-256)
                </button>
              </form>
            </div>
            {assets.length === 0 && <div className="empty">ยังไม่มีไฟล์ อัปโหลดไฟล์แรกด้านล่าง</div>}
            {assets.map((a) => {
              const an = json<{ peaks?: number[] }>(a.analysis, {});
              return (
                <div key={a.id} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
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
                  {a.kind === "audio" && <audio controls preload="none" src={`/api/media/${a.id}`} style={{ width: "100%" }} />}
                  <div className="row xs muted">
                    <span className="mono">SHA-256 {a.sha256.slice(0, 20)}…</span>
                    <span>ตรวจล่าสุด {thDate(a.fixity_checked_at)}</span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card">
            <h2>อัปโหลดไฟล์</h2>
            <UploadAsset
              sessionId={s.id}
              instruments={instruments}
              disabled={s.revoked_at ? "ความยินยอมของรอบนี้ถูกถอนแล้ว อัปโหลดเพิ่มไม่ได้" : !s.consent_id ? "ต้องบันทึกความยินยอมก่อน" : undefined}
            />
          </section>

          <section className="card">
            <h2>ถอดความบทสัมภาษณ์</h2>
            <p className="small muted">พิมพ์หรือวางคำถอดความ ระบบจะส่งให้ผู้เชี่ยวชาญตรวจก่อนนำเข้าคลังความรู้ของครูผู้ช่วย AI</p>
            <form action={addTranscript} className="stack">
              <input type="hidden" name="sessionId" value={s.id} />
              <textarea id="transcript" name="transcript" placeholder="คำถอดความ…" />
              <button className="btn ghost" type="submit">
                ส่งคำถอดความเข้าคิวตรวจ
              </button>
            </form>
          </section>

          <section className="card">
            <h2>ส่วนย่อยในรอบนี้</h2>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ประเภท</th>
                    <th className="num">AI มั่นใจ</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {segs.map((g) => (
                    <tr key={g.id}>
                      <td className="mono">{g.id}</td>
                      <td>
                        {CONTENT_TYPES[g.kind] ?? g.kind}
                        {g.transcript && <div className="xs muted">{g.transcript.slice(0, 80)}…</div>}
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
            <h3>ความยินยอม</h3>
            <AccessBadge level={s.access_level} revoked={!!s.revoked_at} />
            <div className="row">
              {labels.map((l) => (
                <span key={l} className="badge" title={TK_LABELS.find((t) => t.code === l)?.th}>
                  {l}
                </span>
              ))}
            </div>
            <Link className="small" href="/consent">
              จัดการความยินยอม
            </Link>
          </section>
          <section className="card">
            <h3>รายการตรวจก่อนปิดรอบ</h3>
            {CHECKLIST.map((c) => (
              <form key={c.key} action={toggleCheck.bind(null, s.id, c.key)}>
                <button type="submit" className="btn ghost sm" style={{ width: "100%", justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }}>
                  <span style={{ color: check[c.key] ? "var(--ok)" : "var(--muted)" }}>{check[c.key] ? "✓" : "○"}</span> {c.label}
                  {c.required && !check[c.key] && <span className="badge warn">บังคับ</span>}
                </button>
              </form>
            ))}
          </section>
          <section className="card">
            <h3>ส่งรอบบันทึก</h3>
            {s.status === "submitted" ? (
              <span className="badge ok">ส่งให้ผู้เชี่ยวชาญตรวจแล้ว</span>
            ) : (
              <>
                {missing.length > 0 && <p className="small" style={{ color: "var(--warn)" }}>ยังขาด: {missing.map((m) => m.label).join(", ")}</p>}
                <form action={submitSession.bind(null, s.id)}>
                  <button className="btn" type="submit" disabled={!canSubmit}>
                    ส่งตรวจรับรอง
                  </button>
                </form>
                {segs.length === 0 && <p className="xs muted">ต้องมีไฟล์หรือคำถอดความอย่างน้อยหนึ่งชิ้น</p>}
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
