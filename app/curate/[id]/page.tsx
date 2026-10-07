import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { Icon } from "@/components/ui/Icon";
import { parseNotation } from "@/lib/notation";
import { json, pct } from "@/lib/format";
import { asrState, type AsrState } from "@/lib/field";
import { AutoRefresh } from "@/components/AutoRefresh";
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
  const { t } = await getT();
  const CONTENT_TYPES = t.contentTypes as Record<string, string>;
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
  // ai_suggestion เก็บได้ทั้งผลวิเคราะห์ดนตรี (มี notes) และสถานะการถอดความบทสัมภาษณ์ (มี asr)
  const raw = json<(Analysis & { asr?: undefined }) | { asr: AsrState; notes?: undefined } | null>(sg.ai_suggestion, null);
  const ai = raw?.notes ? (raw as Analysis) : null;
  const asr = asrState(sg.ai_suggestion, sg.id);
  const peaks = json<{ peaks?: number[] }>(sg.asset_analysis, {}).peaks;
  const works = all<{ id: number; title: string }>("SELECT id, title FROM works ORDER BY id");
  const variants = all<{ id: number; work_id: number; name: string }>("SELECT id, work_id, name FROM variants ORDER BY id");
  const instruments = all<{ id: number; name_th: string }>("SELECT id, name_th FROM instruments ORDER BY id");
  const suggestedNotation = sg.notation ?? ai?.notation ?? "";
  const lowNotes = ai?.notes.filter((n) => n.clarity < 0.8 || Math.abs(n.deviation) > 40).length ?? 0;
  const isMusic = sg.kind === "performance" || sg.kind === "teaching";

  return (
    <main id="main" className="page">
      <div className="page-head">
        <Link href="/curate" className="small">
          <Icon name="back" size={16} />
          {t.review.back}
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
      {error === "notation" && <div className="notice crit">{t.review.badNotation}</div>}
      {sg.revoked_at && <div className="notice crit">{t.review.revoked}</div>}

      <div className="split">
        <div className="stack-lg">
          {sg.asset_id && (
            <section className="card">
              <h3>{t.review.source}</h3>
              {peaks && <Waveform peaks={peaks} />}
              <audio controls preload="metadata" src={`/api/media/${sg.asset_id}`} style={{ width: "100%" }} />
            </section>
          )}

          {asr && (
            <section className={`notice ${asr.status === "failed" ? "crit" : asr.status === "running" ? "" : "warn"}`}>
              {asr.status === "running" && (
                <>
                  {fmt(t.asr.running, { model: asr.model })}
                  <AutoRefresh seconds={5} />
                </>
              )}
              {asr.status === "done" && (
                <>
                  {fmt(t.asr.done, { model: asr.model, lang: asr.language ? fmt(t.asr.lang, { l: asr.language }) : "" })}
                </>
              )}
              {asr.status === "failed" && <>{fmt(t.asr.failed, { error: asr.error ?? "" })}</>}
            </section>
          )}

          {ai && (
            <section className="card">
              <div className="row between">
                <h3>{t.review.ai}</h3>
                <span className={`badge ${ai.confidence < 0.7 ? "warn" : "ok"}`}>{fmt(t.review.confidence, { pct: pct(ai.confidence) })}</span>
              </div>
              <div className="grid cols-4 small">
                <div className="stat">
                  <b>{ai.notes.length}</b>
                  <span>{t.review.notesFound}</span>
                </div>
                <div className="stat">
                  <b>{ai.baseHz}</b>
                  <span>{t.review.doHz}</span>
                </div>
                <div className="stat">
                  <b>{ai.slotSec ? Math.round(ai.slotSec * 1000) : "-"}</b>
                  <span>{t.review.msPerSlot}</span>
                </div>
                <div className="stat">
                  <b style={{ color: lowNotes ? "var(--warn)" : undefined }}>{lowNotes}</b>
                  <span>{t.review.relisten}</span>
                </div>
              </div>
              {ai.notation && <NotationGrid slots={parseNotation(ai.notation)} />}
              {ai.tuning && (
                <>
                  <p className="small">{fmt(t.review.tuningMeasured, { hz: ai.tuning.baseHz })}</p>
                  <TuningChart steps={ai.tuning.steps} title={t.viz.tuning} axis={t.viz.tuningAxis} />
                </>
              )}
              <p className="xs muted">{t.review.method}</p>
            </section>
          )}

          <form action={reviewSegment} className="card stack">
            <input type="hidden" name="segmentId" value={sg.id} />
            <h3>{t.review.decision}</h3>
            {isMusic && (
              <div className="grid cols-3">
                <label>
                  {t.review.work}
                  <select id="workId" name="workId" defaultValue={sg.work_id ?? ""}>
                    <option value="">{t.review.unspecified}</option>
                    {works.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.review.variant}
                  <select id="variantId" name="variantId" defaultValue={sg.variant_id ?? ""}>
                    <option value="">{t.review.newVariantOpt}</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {works.find((w) => w.id === v.work_id)?.title} · {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.review.newVariant}
                  <input id="newVariant" name="newVariant" type="text" placeholder={sg.person ? fmt(t.review.newVariantPh, { name: sg.person.replace(" (นามสมมติ)", "") }) : ""} />
                </label>
              </div>
            )}
            {(isMusic || sg.kind === "tuning") && (
              <label>
                {t.review.instrument}
                <select id="instrumentId" name="instrumentId" defaultValue={sg.instrument_id ?? ""}>
                  <option value="">{t.review.unspecified}</option>
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
                {t.review.notation}
                <textarea id="notation" name="notation" className="notation" defaultValue={suggestedNotation} />
                <span className="hint">{t.review.notationHint}</span>
              </label>
            )}
            {(sg.kind === "interview" || isMusic) && (
              <label>
                {sg.kind === "interview" ? t.review.transcript : t.review.remark}
                <textarea key={sg.transcript ? "filled" : "empty"} id="transcript" name="transcript" defaultValue={sg.transcript ?? ""} style={{ minHeight: sg.kind === "interview" ? 200 : 80 }} />
              </label>
            )}
            {isMusic && (
              <div className="row">
                <label className="check">
                  <input type="checkbox" name="makeLesson" /> {t.review.makeLesson}
                </label>
                <label style={{ flex: "0 1 200px" }}>
                  <span className="hint">{t.review.indicator}</span>
                  <input id="indicator" name="indicator" type="text" defaultValue="ศ 2.2 ม.2/1" />
                </label>
              </div>
            )}
            <label>
              {t.review.note}
              <input id="reviewNote" name="reviewNote" type="text" placeholder={t.review.notePh} />
            </label>
            <div className="row">
              <button className="btn" type="submit" name="decision" value="approve">
                <Icon name="check" size={16} />
                {t.review.approve}
              </button>
              <button className="btn danger" type="submit" name="decision" value="reject">
                {t.review.reject}
              </button>
            </div>
          </form>
        </div>

        <aside className="stack-lg">
          <section className="card">
            <h3>{t.review.conditions}</h3>
            <AccessBadge level={sg.access_level} revoked={!!sg.revoked_at} />
            <p className="small">{sg.scope_note}</p>
            {json<string[]>(sg.tk_labels, []).map((l) => (
              <div key={l} className="small">
                <span className="badge">{l}</span> {(t.tk as Record<string, string>)[l]}
              </div>
            ))}
          </section>
          {ai && ai.notes.length > 0 && (
            <section className="card">
              <h3>{t.review.notesFound}</h3>
              <div className="tbl" style={{ maxHeight: 360, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th className="num">{t.review.colSec}</th>
                      <th>{t.review.colNote}</th>
                      <th className="num">Hz</th>
                      <th className="num">±cents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.notes.map((n, i) => (
                      <tr key={i} style={n.clarity < 0.8 || Math.abs(n.deviation) > 40 ? { background: "var(--warn-wash)" } : undefined}>
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
