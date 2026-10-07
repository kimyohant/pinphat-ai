import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { CONTENT_TYPES, TK_LABELS } from "@/lib/access";
import { parseNotation } from "@/lib/notation";
import { json, pct } from "@/lib/format";
import type { Analysis } from "@/lib/audio";
import { AccessBadge } from "@/components/AccessBadge";
import { NotationGrid } from "@/components/NotationGrid";
import { TuningChart } from "@/components/TuningChart";
import { Waveform } from "@/components/Waveform";
import { reviewSegment } from "../actions";

type Seg = {
  id: number;
  kind: string;
  status: string;
  asset_id: number | null;
  work_id: number | null;
  variant_id: number | null;
  instrument_id: number | null;
  notation: string | null;
  transcript: string | null;
  ai_suggestion: string | null;
  ai_confidence: number | null;
  session_id: number;
  code: string;
  title: string;
  person: string | null;
  person_id: number | null;
  access_level: number | null;
  revoked_at: string | null;
  tk_labels: string | null;
  scope_note: string | null;
  asset_analysis: string | null;
  track_label: string | null;
};

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireRole("curator");
  const { id } = await params;
  const { error } = await searchParams;
  const sg = one<Seg>(
    `SELECT sg.*, s.code, s.title, s.person_id, p.display_name AS person, c.access_level, c.revoked_at, c.tk_labels, c.scope_note,
            a.analysis AS asset_analysis, a.track_label
     FROM segments sg JOIN sessions s ON s.id = sg.session_id LEFT JOIN persons p ON p.id = s.person_id
     LEFT JOIN consents c ON c.id = s.consent_id LEFT JOIN assets a ON a.id = sg.asset_id WHERE sg.id = ?`,
    Number(id),
  );
  if (!sg) notFound();
  const ai = json<Analysis | null>(sg.ai_suggestion, null);
  const peaks = json<{ peaks?: number[] }>(sg.asset_analysis, {}).peaks;
  const works = all<{ id: number; title: string }>("SELECT id, title FROM works ORDER BY id");
  const variants = all<{ id: number; work_id: number; name: string }>("SELECT id, work_id, name FROM variants ORDER BY id");
  const instruments = all<{ id: number; name_th: string }>("SELECT id, name_th FROM instruments ORDER BY id");
  const suggestedNotation = sg.notation ?? ai?.notation ?? "";
  const lowNotes = ai?.notes.filter((n) => n.clarity < 0.8 || Math.abs(n.deviation) > 40).length ?? 0;
  const isMusic = sg.kind === "performance" || sg.kind === "teaching";

  return (
    <main className="page">
      <div className="page-head">
        <Link href="/curate" className="small">
          ← คิวตรวจ
        </Link>
        <div className="row">
          <span className="mono muted">
            {sg.code} · #{sg.id}
          </span>
          <h1>{CONTENT_TYPES[sg.kind] ?? sg.kind}</h1>
          <AccessBadge level={sg.access_level} revoked={!!sg.revoked_at} />
        </div>
        <p>
          {sg.title} · {sg.person} {sg.track_label && `· ${sg.track_label}`}
        </p>
      </div>
      {error === "notation" && <div className="notice crit">อ่านโน้ตไม่ได้ ใช้รูปแบบ "- ด - ร | - ม - ซ" (ห้องละ 4 ช่อง คั่นด้วย |)</div>}
      {sg.revoked_at && <div className="notice crit">ความยินยอมของรอบนี้ถูกถอนแล้ว รับรองได้แต่จะไม่ถูกนำเข้าดัชนี AI</div>}

      <div className="split">
        <div className="stack-lg">
          {sg.asset_id && (
            <section className="card">
              <h3>เสียงต้นฉบับ</h3>
              {peaks && <Waveform peaks={peaks} />}
              <audio controls preload="metadata" src={`/api/media/${sg.asset_id}`} style={{ width: "100%" }} />
            </section>
          )}

          {ai && (
            <section className="card">
              <div className="row between">
                <h3>ผลวิเคราะห์ของ AI</h3>
                <span className={`badge ${ai.confidence < 0.7 ? "warn" : "ok"}`}>มั่นใจ {pct(ai.confidence)}</span>
              </div>
              <div className="grid cols-4 small">
                <div className="stat">
                  <b>{ai.notes.length}</b>
                  <span>โน้ตที่ตรวจพบ</span>
                </div>
                <div className="stat">
                  <b>{ai.baseHz}</b>
                  <span>Hz ของเสียง ด</span>
                </div>
                <div className="stat">
                  <b>{ai.slotSec ? Math.round(ai.slotSec * 1000) : "-"}</b>
                  <span>ms ต่อช่อง</span>
                </div>
                <div className="stat">
                  <b style={{ color: lowNotes ? "var(--warn)" : undefined }}>{lowNotes}</b>
                  <span>โน้ตที่ควรฟังซ้ำ</span>
                </div>
              </div>
              {ai.notation && <NotationGrid slots={parseNotation(ai.notation)} />}
              {ai.tuning && (
                <>
                  <p className="small">ระบบเสียงที่วัดได้ (ด = {ai.tuning.baseHz} Hz) เทียบกับ 7 เสียงเท่า</p>
                  <TuningChart steps={ai.tuning.steps} />
                </>
              )}
              <p className="xs muted">วิธีวิเคราะห์: ตรวจจุดเริ่มเสียงจากพลังงาน วัดระดับเสียงด้วย autocorrelation (NSDF) ประมาณ ด ของวงจากค่าเฉลี่ยเชิงวงกลม แล้วจัดลงช่องจังหวะ</p>
            </section>
          )}

          <form action={reviewSegment} className="card stack">
            <input type="hidden" name="segmentId" value={sg.id} />
            <h3>การตัดสิน</h3>
            {isMusic && (
              <div className="grid cols-3">
                <label>
                  เพลง
                  <select id="workId" name="workId" defaultValue={sg.work_id ?? ""}>
                    <option value="">— ไม่ระบุ —</option>
                    {works.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ทาง
                  <select id="variantId" name="variantId" defaultValue={sg.variant_id ?? ""}>
                    <option value="">— ทางใหม่ (กรอกด้านล่าง) —</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {works.find((w) => w.id === v.work_id)?.title} · {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ชื่อทางใหม่
                  <input id="newVariant" name="newVariant" type="text" placeholder={sg.person ? `เช่น ทาง${sg.person.replace(" (นามสมมติ)", "")}` : ""} />
                </label>
              </div>
            )}
            {(isMusic || sg.kind === "tuning") && (
              <label>
                เครื่องดนตรี
                <select id="instrumentId" name="instrumentId" defaultValue={sg.instrument_id ?? ""}>
                  <option value="">— ไม่ระบุ —</option>
                  {instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name_th}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isMusic && (
              <label>
                โน้ตที่รับรอง
                <textarea id="notation" name="notation" className="notation" defaultValue={suggestedNotation} />
                <span className="hint">แก้รายห้องได้ ห้องละ 4 ช่อง คั่นด้วย | ใช้ - แทนช่องที่ไม่ตี และ ดํ แทนเสียงสูง</span>
              </label>
            )}
            {(sg.kind === "interview" || isMusic) && (
              <label>
                {sg.kind === "interview" ? "คำถอดความที่รับรอง" : "หมายเหตุประกอบ (ถ้ามี)"}
                <textarea id="transcript" name="transcript" defaultValue={sg.transcript ?? ""} style={{ minHeight: sg.kind === "interview" ? 200 : 80 }} />
              </label>
            )}
            {isMusic && (
              <div className="row">
                <label className="check">
                  <input type="checkbox" name="makeLesson" /> สร้างบทเรียนจากส่วนนี้หลังรับรอง
                </label>
                <label style={{ flex: "0 1 200px" }}>
                  <span className="hint">ตัวชี้วัด</span>
                  <input id="indicator" name="indicator" type="text" defaultValue="ศ 2.2 ม.2/1" />
                </label>
              </div>
            )}
            <label>
              บันทึกของผู้ตรวจ
              <input id="reviewNote" name="reviewNote" type="text" placeholder="เช่น แก้ห้อง 5 จาก ม ซ ล เป็น ม ซ ซ" />
            </label>
            <div className="row">
              <button className="btn" type="submit" name="decision" value="approve">
                รับรองและนำเข้าคลัง
              </button>
              <button className="btn danger" type="submit" name="decision" value="reject">
                ไม่ผ่าน
              </button>
            </div>
          </form>
        </div>

        <aside className="stack-lg">
          <section className="card">
            <h3>เงื่อนไขจากผู้ให้ข้อมูล</h3>
            <AccessBadge level={sg.access_level} revoked={!!sg.revoked_at} />
            <p className="small">{sg.scope_note}</p>
            {json<string[]>(sg.tk_labels, []).map((l) => (
              <div key={l} className="small">
                <span className="badge">{l}</span> {TK_LABELS.find((t) => t.code === l)?.th}
              </div>
            ))}
          </section>
          {ai && ai.notes.length > 0 && (
            <section className="card">
              <h3>โน้ตที่ตรวจพบ</h3>
              <div className="tbl" style={{ maxHeight: 360, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th className="num">วินาที</th>
                      <th>โน้ต</th>
                      <th className="num">Hz</th>
                      <th className="num">±cents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.notes.map((n, i) => (
                      <tr key={i} style={n.clarity < 0.8 || Math.abs(n.deviation) > 40 ? { background: "var(--warn-soft)" } : undefined}>
                        <td className="num">{n.t.toFixed(2)}</td>
                        <td>
                          {n.note}
                          {n.octave > 0 ? "ํ" : ""}
                        </td>
                        <td className="num">{n.hz}</td>
                        <td className="num">{n.deviation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
