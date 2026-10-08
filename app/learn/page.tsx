import Link from "next/link";
import { getUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { lessonLevel, visibleLessons } from "@/lib/lessons";
import { instrumentName, instruments } from "@/lib/instruments";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { PRACTICE_UI } from "@/lib/i18n/practice-ui";
import { AccessBadge } from "@/components/AccessBadge";
import { Icon } from "@/components/ui/Icon";
import { InstrumentGlyph } from "@/components/practice/InstrumentGlyph";
import { TryInstrument } from "@/components/practice/TryInstrument";
import { pct } from "@/lib/format";
import "./learn.css";

export default async function LearnPage({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const [user, { t, locale }, sp] = await Promise.all([getUser(), getT(), searchParams]);
  const P = PRACTICE_UI[locale];
  const list = instruments();
  const lessons = visibleLessons(user.role);
  const count = (id: number) => lessons.filter((l) => l.instrument_id === id).length;
  const sel = list.find((i) => i.id === Number(sp.i)) ?? list.find((i) => count(i.id) > 0) ?? list[0];
  const shown = lessons.filter((l) => l.instrument_id === sel?.id);
  const mine = user.id
    ? all<{ lesson_id: number; best: number; n: number }>("SELECT lesson_id, MAX(accuracy) AS best, COUNT(*) AS n FROM practice_attempts WHERE user_id = ? GROUP BY lesson_id", user.id)
    : [];
  const due = user.class_name ? all<{ lesson_id: number; due_on: string }>("SELECT lesson_id, due_on FROM assignments WHERE class_name = ? ORDER BY due_on", user.class_name) : [];

  return (
    <main id="main" className="learn-page">
      <section className="lstage on-night" aria-labelledby="learn-title">
        <div className="pstage-bg" aria-hidden="true" />
        <div className="lstage-top">
          <span className="stage-eyebrow">{t.learn.eyebrow}</span>
          <h1 id="learn-title">{t.learn.title}</h1>
          <p>{t.learn.lede}</p>
        </div>

        {due.length > 0 && (
          <div className="ldue">
            <Icon name="teach" size={16} />
            <b>{t.learn.assigned}</b>
            {due.map((d, i) => {
              const l = lessons.find((x) => x.id === d.lesson_id);
              return (
                <Link key={i} href={`/learn/${d.lesson_id}`}>
                  {l?.title ?? fmt(t.learn.lessonN, { n: d.lesson_id })} · {fmt(t.common.dueBy, { date: fmtDate(d.due_on, locale) })}
                </Link>
              );
            })}
          </div>
        )}

        <div className="picker-head">
          <span>{P.pick}</span>
          <span className="sugg-swipe">
            {t.common.swipe}
            <Icon name="arrow" size={14} />
          </span>
        </div>
        <nav className="picker" aria-label={P.pick}>
          {list.map((i, k) => (
            <Link key={i.id} href={`/learn?i=${i.id}`} scroll={false} className="pick" aria-current={i.id === sel?.id ? "page" : undefined} style={{ "--i": k } as React.CSSProperties}>
              <InstrumentGlyph kind={i.play_kind} register={i.play_register} size={52} />
              <b>{instrumentName(i, locale)}</b>
              <span>
                {(P as Record<string, string>)[`kind_${i.play_kind}`]} · {fmt(P.lessonsN, { n: count(i.id) })}
              </span>
            </Link>
          ))}
        </nav>

        {sel && (
          <div className="lstage-body">
            <div className="try">
              <div className="try-head">
                <InstrumentGlyph kind={sel.play_kind} register={sel.play_register} size={64} />
                <div>
                  <h2>{instrumentName(sel, locale)}</h2>
                  <span className="try-names">
                    {[sel.name_th, sel.name_lo, sel.name_en].filter((n, k, a) => n && a.indexOf(n) === k && n !== instrumentName(sel, locale)).join(" · ")}
                  </span>
                </div>
              </div>
              {sel.description && <p className="try-desc">{sel.description}</p>}
              <span className="try-label">
                <Icon name="spark" size={14} />
                {P.tryIt}
              </span>
              <TryInstrument kind={sel.play_kind} register={sel.play_register} />
            </div>

            <div className="llist">
              {shown.length === 0 && <div className="lempty">{P.noLessons}</div>}
              {shown.map((l) => {
                const m = mine.find((x) => x.lesson_id === l.id);
                const isDue = due.some((d) => d.lesson_id === l.id);
                return (
                  <Link key={l.id} href={`/learn/${l.id}`} className="lcard">
                    <div className="lcard-top">
                      <span className="difficulty" aria-label={fmt(t.common.level, { n: l.difficulty })}>
                        {[1, 2, 3].map((k) => (
                          <i key={k} className={k <= l.difficulty ? "on" : undefined} />
                        ))}
                        <span>{fmt(t.common.level, { n: l.difficulty })}</span>
                      </span>
                      <span className="row">
                        {isDue && <span className="badge warn">{t.learn.assigned}</span>}
                        <AccessBadge level={lessonLevel(l)} />
                      </span>
                    </div>
                    <h3>{l.title}</h3>
                    {l.description && <p>{l.description}</p>}
                    <div className="lcard-meta">
                      <span>{fmt(P.tempo, { n: l.tempo })}</span>
                      {l.grade && <span>{l.grade}</span>}
                      {l.person && <span>{fmt(t.common.by, { name: l.person })}</span>}
                    </div>
                    <div className="lcard-foot">
                      {m ? (
                        <>
                          <div className="lmeter" role="img" aria-label={fmt(t.learn.best, { pct: pct(m.best) })}>
                            <i style={{ width: `${Math.round(m.best * 100)}%` }} />
                          </div>
                          <span>
                            {fmt(t.learn.practiced, { n: m.n })} · <b>{fmt(t.learn.best, { pct: pct(m.best) })}</b>
                          </span>
                        </>
                      ) : (
                        <span>{t.learn.notStarted}</span>
                      )}
                      <span className="lgo" aria-hidden="true">
                        <Icon name="play" size={16} />
                      </span>
                    </div>
                  </Link>
                );
              })}
              <p className="ldemo">{P.demoNote}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
