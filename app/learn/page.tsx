import Link from "next/link";
import { getUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { lessonLevel, visibleLessons } from "@/lib/lessons";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { AccessBadge } from "@/components/AccessBadge";
import { Icon } from "@/components/ui/Icon";
import { pct } from "@/lib/format";

export default async function LearnPage() {
  const [user, { t, locale }] = await Promise.all([getUser(), getT()]);
  const lessons = visibleLessons(user.role);
  const mine = user.id
    ? all<{ lesson_id: number; best: number; n: number }>("SELECT lesson_id, MAX(accuracy) AS best, COUNT(*) AS n FROM practice_attempts WHERE user_id = ? GROUP BY lesson_id", user.id)
    : [];
  const due = user.class_name
    ? all<{ lesson_id: number; due_on: string }>("SELECT lesson_id, due_on FROM assignments WHERE class_name = ? ORDER BY due_on", user.class_name)
    : [];
  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{t.learn.eyebrow}</span>
        <h1>{t.learn.title}</h1>
        <p>{t.learn.lede}</p>
      </div>
      {due.length > 0 && (
        <div className="notice">
          <b>{t.learn.assigned}</b>
          {": "}
          {due.map((d, i) => (
            <span key={i}>
              {lessons.find((l) => l.id === d.lesson_id)?.title ?? fmt(t.learn.lessonN, { n: d.lesson_id })} ({fmt(t.common.dueBy, { date: fmtDate(d.due_on, locale) })})
              {i < due.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}
      <div className="grid cols-3">
        {lessons.map((l) => {
          const m = mine.find((x) => x.lesson_id === l.id);
          const isDue = due.some((d) => d.lesson_id === l.id);
          return (
            <Link key={l.id} href={`/learn/${l.id}`} className="card lesson-card">
              <div className="row between">
                <span className="difficulty" aria-label={fmt(t.common.level, { n: l.difficulty })}>
                  {[1, 2, 3].map((k) => (
                    <i key={k} className={k <= l.difficulty ? "on" : undefined} />
                  ))}
                  <span>{fmt(t.common.level, { n: l.difficulty })}</span>
                </span>
                <AccessBadge level={lessonLevel(l)} />
              </div>
              <h3>{l.title}</h3>
              <p className="small muted">{l.description}</p>
              <div className="row xs muted">
                <span>{l.grade}</span>
                <span className="mono">{l.indicator}</span>
                {l.person && <span>{fmt(t.common.by, { name: l.person })}</span>}
              </div>
              <div className="lesson-foot">
                {m ? (
                  <>
                    <div className="meter" role="img" aria-label={fmt(t.learn.best, { pct: pct(m.best) })}>
                      <span style={{ width: `${Math.round(m.best * 100)}%` }} />
                    </div>
                    <span className="xs">
                      {fmt(t.learn.practiced, { n: m.n })} · <b>{fmt(t.learn.best, { pct: pct(m.best) })}</b>
                    </span>
                  </>
                ) : (
                  <span className="xs muted">{t.learn.notStarted}</span>
                )}
                <span className="lesson-go" aria-hidden="true">
                  {isDue && <span className="badge warn">{t.learn.assigned}</span>}
                  <Icon name="play" size={16} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {lessons.length === 0 && <div className="empty">{t.learn.empty}</div>}
    </main>
  );
}
