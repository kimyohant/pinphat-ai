import { getUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { canSee, CONTENT_TYPES } from "@/lib/access";
import { parseNotation } from "@/lib/notation";
import { json } from "@/lib/format";
import { AccessBadge } from "@/components/AccessBadge";
import { LineageGraph } from "@/components/LineageGraph";
import { NotationGrid } from "@/components/NotationGrid";
import { TuningChart } from "@/components/TuningChart";

type Seg = {
  id: number;
  kind: string;
  notation: string | null;
  transcript: string | null;
  asset_id: number | null;
  work_id: number | null;
  variant: string | null;
  person: string | null;
  code: string;
  access_level: number | null;
  revoked_at: string | null;
  instrument: string | null;
};

export default async function ArchivePage() {
  const user = await getUser();
  const persons = all<{ id: number; display_name: string; role: string; province: string; district: string; birth_year: number | null; bio: string | null }>(
    "SELECT id, display_name, role, province, district, birth_year, bio FROM persons ORDER BY id",
  );
  const edges = all<{ teacher_id: number; student_id: number; note: string | null }>("SELECT teacher_id, student_id, note FROM lineage");
  const segs = all<Seg>(`
    SELECT sg.id, sg.kind, sg.notation, sg.transcript, sg.asset_id, sg.work_id, v.name AS variant, p.display_name AS person, s.code,
           c.access_level, c.revoked_at, i.name_th AS instrument
    FROM segments sg JOIN sessions s ON s.id = sg.session_id LEFT JOIN persons p ON p.id = s.person_id
    LEFT JOIN consents c ON c.id = s.consent_id LEFT JOIN variants v ON v.id = sg.variant_id LEFT JOIN instruments i ON i.id = sg.instrument_id
    WHERE sg.status = 'approved' ORDER BY sg.id`).filter((s) => !s.revoked_at && canSee(user.role, s.access_level));
  const works = all<{ id: number; title: string; genre: string; description: string }>("SELECT id, title, genre, description FROM works ORDER BY id");
  const instruments = all<{ id: number; name_th: string; name_lo: string; name_en: string; family: string; description: string }>("SELECT * FROM instruments ORDER BY id");
  const tunings = all<{ instrument_id: number; base_hz: number; steps: string; person: string; access_level: number | null; revoked_at: string | null }>(`
    SELECT t.instrument_id, t.base_hz, t.steps, p.display_name AS person, c.access_level, c.revoked_at
    FROM tunings t JOIN segments sg ON sg.id = t.segment_id JOIN sessions s ON s.id = sg.session_id
    LEFT JOIN persons p ON p.id = t.person_id LEFT JOIN consents c ON c.id = s.consent_id`).filter((t) => !t.revoked_at && canSee(user.role, t.access_level));
  const interviews = segs.filter((s) => s.kind === "interview");

  return (
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">คลังความรู้</div>
        <h1>ครู เพลง ทาง และเสียง</h1>
        <p>แสดงเฉพาะข้อมูลที่ผ่านการรับรองและอยู่ในระดับสิทธิ์ของคุณ ทุกชิ้นระบุครูผู้ถ่ายทอดและรหัสรอบบันทึก</p>
      </div>

      <section className="card">
        <h2>สายการสืบทอด</h2>
        <LineageGraph persons={persons} edges={edges} />
        <div className="grid cols-3">
          {persons.map((p) => (
            <div key={p.id} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <b>{p.display_name}</b>
              <span className="xs muted">
                {p.district} · {p.province} {p.birth_year ? `· เกิด ${p.birth_year + 543}` : ""}
              </span>
              <span className="small">{p.bio}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>เพลงและทาง</h2>
        {works.map((w) => {
          const list = segs.filter((s) => s.work_id === w.id);
          return (
            <div key={w.id} className="card">
              <div className="row between">
                <h3>{w.title}</h3>
                <span className="badge">{w.genre}</span>
              </div>
              <p className="small muted">{w.description}</p>
              {list.length === 0 && <p className="xs muted">ยังไม่มีการบรรเลงที่รับรองแล้วในระดับสิทธิ์ของคุณ</p>}
              {list.map((s) => (
                <div key={s.id} id={`seg-${s.id}`} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div className="row between">
                    <span>
                      <b>{s.variant}</b> · {s.person} · {s.instrument}
                    </span>
                    <span className="row">
                      <span className="mono xs muted">
                        {s.code} · #{s.id}
                      </span>
                      <AccessBadge level={s.access_level} />
                    </span>
                  </div>
                  {s.asset_id && <audio controls preload="none" src={`/api/media/${s.asset_id}`} style={{ width: "100%" }} />}
                  {s.notation && <NotationGrid slots={parseNotation(s.notation)} />}
                </div>
              ))}
            </div>
          );
        })}
      </section>

      <section className="stack">
        <h2>บทสัมภาษณ์</h2>
        {interviews.length === 0 && <div className="empty">ยังไม่มีบทสัมภาษณ์ในระดับสิทธิ์ของคุณ</div>}
        <div className="grid cols-2">
          {interviews.map((s) => (
            <div key={s.id} id={`seg-${s.id}`} className="card">
              <div className="row between">
                <b>{s.person}</b>
                <AccessBadge level={s.access_level} />
              </div>
              <p className="small" style={{ whiteSpace: "pre-wrap" }}>
                {s.transcript}
              </p>
              <span className="mono xs muted">
                {s.code} · #{s.id} · {CONTENT_TYPES.interview}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>เครื่องดนตรีและระบบเสียง</h2>
        <div className="grid cols-2">
          {instruments.map((i) => {
            const t = tunings.filter((x) => x.instrument_id === i.id);
            return (
              <div key={i.id} className="card">
                <div className="row between">
                  <h3>
                    {i.name_th} <span className="lao muted small">{i.name_lo}</span>
                  </h3>
                  <span className="badge">{i.family}</span>
                </div>
                <span className="xs muted">{i.name_en}</span>
                <p className="small">{i.description}</p>
                {t.map((x, k) => (
                  <div key={k} className="stack">
                    <span className="small">
                      ระบบเสียงวง{x.person} · ด = {x.base_hz} Hz
                    </span>
                    <TuningChart steps={json(x.steps, [])} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
