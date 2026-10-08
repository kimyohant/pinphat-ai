import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { json } from "@/lib/format";
import { parseNotation } from "@/lib/notation";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtYear } from "@/lib/i18n/config";
import { ARCHIVE_UI } from "@/lib/i18n/archive-ui";
import { consentOf, initialOf, lineage, peaksOf, person, persons, shortName, visibleSegments, visibleTunings } from "@/lib/archive";
import { AccessBadge } from "@/components/AccessBadge";
import { NotationGrid } from "@/components/NotationGrid";
import { TuningChart } from "@/components/TuningChart";
import { Waveform } from "@/components/Waveform";
import { Icon } from "@/components/ui/Icon";
import "../../archive.css";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, { t, locale }] = await Promise.all([params, getUser(), getT()]);
  const A = ARCHIVE_UI[locale];
  const p = person(Number(id));
  if (!p) notFound();
  const segs = visibleSegments(user.role).filter((s) => s.person_id === p.id);
  const total = all<{ n: number }>("SELECT COUNT(*) AS n FROM segments sg JOIN sessions s ON s.id = sg.session_id WHERE s.person_id = ? AND sg.status = 'approved'", p.id)[0]?.n ?? 0;
  const perf = segs.filter((s) => s.kind === "performance" || s.kind === "teaching");
  const interviews = segs.filter((s) => s.kind === "interview");
  const tunings = visibleTunings(user.role).filter((x) => x.person_id === p.id);
  const consent = consentOf(p.id);
  const ppl = persons();
  const edges = lineage();
  const teachers = edges.filter((e) => e.student_id === p.id).map((e) => ({ ...ppl.find((x) => x.id === e.teacher_id)!, note: e.note })).filter((x) => x.id);
  const students = edges.filter((e) => e.teacher_id === p.id).map((e) => ({ ...ppl.find((x) => x.id === e.student_id)!, note: e.note })).filter((x) => x.id);
  const TK = t.tk as Record<string, string>;

  return (
    <main id="main" className="archive-page">
      <section className="astage on-night">
        <div className="pstage-bg" aria-hidden="true" />
        <Link href="/archive" className="p-back">
          <Icon name="back" size={16} />
          {A.back}
        </Link>
        <header className="aphead">
          <span className={`aav xl${p.role === "master" ? " master" : ""}`} aria-hidden="true">
            {initialOf(p.display_name)}
          </span>
          <div>
            <span className="stage-eyebrow">{p.role === "master" ? A.master : A.artist}</span>
            <h1>{shortName(p.display_name)}</h1>
            <p className="aphead-meta">
              {p.district} · {p.province}
              {p.birth_year ? ` · ${fmt(t.common.born, { year: fmtYear(p.birth_year, locale) })}` : ""}
            </p>
            {p.bio && <p className="aphead-bio">{p.bio}</p>}
            <div className="p-chips">
              {consent && <AccessBadge level={consent.access_level} revoked={!!consent.revoked_at} />}
              {json<string[]>(consent?.tk_labels, []).map((l) => (
                <span key={l} className="p-chip" title={TK[l]}>
                  {l} · {TK[l]}
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="astats small">
          <div>
            <b>{perf.length}</b>
            <span>{A.tabRecordings}</span>
          </div>
          <div>
            <b>{interviews.length}</b>
            <span>{A.interviews}</span>
          </div>
          <div>
            <b>{teachers.length}</b>
            <span>{A.teachers}</span>
          </div>
          <div>
            <b>{students.length}</b>
            <span>{A.students}</span>
          </div>
        </div>
        {total > segs.length && <p className="ahint">{fmt(A.hidden, { n: total - segs.length })}</p>}

        {(teachers.length > 0 || students.length > 0) && (
          <div className="alinks">
            {teachers.length > 0 && (
              <div>
                <span className="stage-eyebrow">{A.teachers}</span>
                {teachers.map((x) => (
                  <Link key={x.id} href={`/archive/person/${x.id}`} className="alink">
                    <span className="aav sm">{initialOf(x.display_name)}</span>
                    <span>
                      <b>{shortName(x.display_name)}</b>
                      {x.note && <small>{x.note}</small>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {students.length > 0 && (
              <div>
                <span className="stage-eyebrow">{A.students}</span>
                {students.map((x) => (
                  <Link key={x.id} href={`/archive/person/${x.id}`} className="alink">
                    <span className="aav sm">{initialOf(x.display_name)}</span>
                    <span>
                      <b>{shortName(x.display_name)}</b>
                      {x.note && <small>{x.note}</small>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {perf.length > 0 && (
          <div className="asection">
            <h2>{A.tabWorks}</h2>
            {perf.map((s) => (
              <div key={s.id} id={`seg-${s.id}`} className="arec">
                <div className="arec-top">
                  <span>
                    {s.work_id ? <Link href={`/archive/work/${s.work_id}`}>{s.work}</Link> : <b>{s.work}</b>}
                    {s.variant ? ` · ${s.variant}` : ""}
                  </span>
                  <AccessBadge level={s.access_level} />
                </div>
                <span className="arec-meta">
                  {s.instrument && <span>{s.instrument}</span>}
                  <span className="mono">{s.code}</span>
                </span>
                {peaksOf(s) && <Waveform peaks={peaksOf(s)!} />}
                {s.asset_id && <audio controls preload="none" src={`/api/media/${s.asset_id}`} />}
                {s.notation && <NotationGrid slots={parseNotation(s.notation)} label={t.viz.notation} />}
              </div>
            ))}
          </div>
        )}

        {interviews.length > 0 && (
          <div className="asection">
            <h2>{A.tabInterviews}</h2>
            <div className="aints">
              {interviews.map((s) => (
                <article key={s.id} id={`seg-${s.id}`} className="aint">
                  <p>{s.transcript}</p>
                  <footer className="mono">
                    {s.code} · #{s.id}
                  </footer>
                </article>
              ))}
            </div>
          </div>
        )}

        {tunings.length > 0 && (
          <div className="asection">
            <h2>{A.tuning}</h2>
            {tunings.map((x, k) => (
              <div key={k} className="ainst-tune">
                <span>ด = {x.base_hz} Hz</span>
                <TuningChart steps={json(x.steps, [])} title={t.viz.tuning} axis={t.viz.tuningAxis} />
              </div>
            ))}
          </div>
        )}

        {segs.length === 0 && <div className="aempty">{A.empty}</div>}
        <p className="ademo">{A.demoNote}</p>
      </section>
    </main>
  );
}
