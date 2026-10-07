import Link from "next/link";
import { getUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { canSee } from "@/lib/access";
import { parseNotation } from "@/lib/notation";
import { json } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtYear } from "@/lib/i18n/config";
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

const TABS = ["works", "lineage", "interviews", "instruments"] as const;
type Tab = (typeof TABS)[number];

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [user, { t, locale }, sp] = await Promise.all([getUser(), getT(), searchParams]);
  // แท็บแทนการเรียงสี่ส่วนต่อกัน: บนมือถือหน้านี้เคยยาวเกือบสี่หน้าจอ
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "works";
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
    LEFT JOIN persons p ON p.id = t.person_id LEFT JOIN consents c ON c.id = s.consent_id`).filter((x) => !x.revoked_at && canSee(user.role, x.access_level));
  const interviews = segs.filter((s) => s.kind === "interview");
  const performances = segs.filter((s) => s.work_id);

  const tabLabel: Record<Tab, string> = {
    works: t.archive.tabWorks,
    lineage: t.archive.tabLineage,
    interviews: t.archive.tabInterviews,
    instruments: t.archive.tabInstruments,
  };
  const count: Record<Tab, number> = { works: performances.length, lineage: persons.length, interviews: interviews.length, instruments: instruments.length };
  const instName = (i: (typeof instruments)[number]) => (locale === "lo" ? i.name_lo : locale === "en" ? i.name_en : i.name_th);
  const initial = (name: string) => name.replace(/^(ครูภูมิปัญญา|ศิลปิน)\s*/u, "").slice(0, 1);

  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{t.archive.eyebrow}</span>
        <h1>{t.archive.title}</h1>
        <p>{t.archive.lede}</p>
      </div>

      <nav className="tabs" aria-label={t.archive.eyebrow}>
        {TABS.map((k) => (
          <Link key={k} href={k === "works" ? "/archive" : `/archive?tab=${k}`} aria-current={tab === k ? "page" : undefined} scroll={false}>
            {tabLabel[k]}
            <span className="count">{count[k]}</span>
          </Link>
        ))}
      </nav>

      {tab === "works" && (
        <section className="stack" aria-label={t.archive.works}>
          {works.map((w) => {
            const list = segs.filter((s) => s.work_id === w.id);
            return (
              <div key={w.id} className="card">
                <div className="row between">
                  <h3>{w.title}</h3>
                  <span className="badge">{w.genre}</span>
                </div>
                <p className="small muted">{w.description}</p>
                {list.length === 0 && <p className="xs muted">{t.archive.noPerf}</p>}
                {list.map((s) => (
                  <div key={s.id} id={`seg-${s.id}`} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s3)" }}>
                    <div className="row between">
                      <span className="small">
                        <b>{s.variant}</b> · {s.person} · {s.instrument}
                      </span>
                      <span className="row">
                        <span className="mono xs muted">
                          {s.code} · #{s.id}
                        </span>
                        <AccessBadge level={s.access_level} />
                      </span>
                    </div>
                    {s.asset_id && <audio controls preload="none" src={`/api/media/${s.asset_id}`} />}
                    {s.notation && <NotationGrid slots={parseNotation(s.notation)} />}
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {tab === "lineage" && (
        <section className="card" aria-label={t.archive.lineage}>
          <div className="graph-scroll">
            <LineageGraph persons={persons} edges={edges} />
          </div>
          <div className="grid cols-3">
            {persons.map((p) => (
              <div key={p.id} className="person">
                <span className="avatar" aria-hidden="true">
                  {initial(p.display_name)}
                </span>
                <b>{p.display_name}</b>
                <span className="xs muted">
                  {p.district} · {p.province} {p.birth_year ? `· ${fmt(t.common.born, { year: fmtYear(p.birth_year, locale) })}` : ""}
                </span>
                <span className="small">{p.bio}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "interviews" && (
        <section className="stack" aria-label={t.archive.interviews}>
          {interviews.length === 0 && <div className="empty">{t.archive.noInterviews}</div>}
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
                  {s.code} · #{s.id} · {t.contentTypes.interview}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "instruments" && (
        <section className="grid cols-2" aria-label={t.archive.instruments}>
          {instruments.map((i) => {
            const tu = tunings.filter((x) => x.instrument_id === i.id);
            return (
              <div key={i.id} className="card">
                <div className="row between">
                  <h3>
                    {instName(i)}{" "}
                    {locale !== "lo" && (
                      <span className="lao muted small" lang="lo">
                        {i.name_lo}
                      </span>
                    )}
                  </h3>
                  <span className="badge">{i.family}</span>
                </div>
                <span className="xs muted">{locale === "en" ? i.name_th : i.name_en}</span>
                <p className="small">{i.description}</p>
                {tu.map((x, k) => (
                  <div key={k} className="stack">
                    <span className="small">{fmt(t.archive.tuningOf, { name: x.person, hz: x.base_hz })}</span>
                    <TuningChart steps={json(x.steps, [])} />
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
