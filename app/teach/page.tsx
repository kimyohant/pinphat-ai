import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { barCount, parseNotation } from "@/lib/notation";
import { json, pct } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { visibleLessons } from "@/lib/lessons";
import { assignLesson, lessonFromSegment } from "./actions";

type Attempt = { user_id: number; lesson_id: number; accuracy: number; timing_ms: number; bar_errors: string; created_at: string };

export default async function TeachPage() {
  const user = await requireRole("teacher", "curator");
  const { t, locale } = await getT();
  const thDate = (d: string | null | undefined) => fmtDate(d, locale);
  const cls = user.class_name ?? "ม.2/1";
  const students = all<{ id: number; name: string }>("SELECT id, name FROM users WHERE role = 'student' AND class_name = ? ORDER BY id", cls);
  const ids = students.map((s) => s.id);
  const attempts = ids.length
    ? all<Attempt>(`SELECT user_id, lesson_id, accuracy, timing_ms, bar_errors, created_at FROM practice_attempts WHERE user_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`, ...ids)
    : [];
  const lessons = visibleLessons("teacher");
  const assignments = all<{ id: number; lesson_id: number; due_on: string; title: string }>(
    "SELECT a.id, a.lesson_id, a.due_on, l.title FROM assignments a JOIN lessons l ON l.id = a.lesson_id WHERE a.class_name = ? ORDER BY a.due_on",
    cls,
  );
  const segments = all<{ id: number; code: string; person: string; variant: string | null; work: string | null }>(`
    SELECT sg.id, s.code, p.display_name AS person, v.name AS variant, w.title AS work FROM segments sg
    JOIN sessions s ON s.id = sg.session_id LEFT JOIN persons p ON p.id = s.person_id LEFT JOIN variants v ON v.id = sg.variant_id
    LEFT JOIN works w ON w.id = sg.work_id LEFT JOIN consents c ON c.id = s.consent_id
    WHERE sg.status = 'approved' AND sg.notation IS NOT NULL AND c.access_level IN (1, 2) AND c.revoked_at IS NULL`);

  const rows = students.map((s) => {
    const mine = attempts.filter((a) => a.user_id === s.id);
    const recent = mine.slice(-3);
    const avg = recent.length ? recent.reduce((x, a) => x + a.accuracy, 0) / recent.length : null;
    const last = mine.at(-1);
    const done = assignments.filter((a) => mine.some((m) => m.lesson_id === a.lesson_id && m.accuracy >= 0.8)).length;
    const weak = new Map<string, number>();
    mine.slice(-4).forEach((a) => json<number[]>(a.bar_errors, []).forEach((b) => weak.set(`${a.lesson_id}:${b}`, (weak.get(`${a.lesson_id}:${b}`) ?? 0) + 1)));
    const worst = [...weak.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    return { ...s, n: mine.length, avg, last, done, worst };
  });
  const needHelp = rows.filter((r) => r.avg != null && r.avg < 0.7);
  const classAvg = rows.filter((r) => r.avg != null).reduce((x, r, _, arr) => x + r.avg! / arr.length, 0);

  // ห้องที่ทั้งชั้นพลาดบ่อยในแต่ละบทเรียน
  const heat = lessons.map((l) => {
    const bars = barCount(parseNotation(l.notation));
    const counts = Array.from({ length: bars }, () => 0);
    const tries = attempts.filter((a) => a.lesson_id === l.id);
    tries.forEach((a) => json<number[]>(a.bar_errors, []).forEach((b) => b < bars && counts[b]++));
    return { l, counts, tries: tries.length };
  });

  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{fmt(t.teach.eyebrow, { cls })}</span>
        <h1>{t.teach.title}</h1>
        <p>{t.teach.lede}</p>
      </div>
      <div className="grid cols-4">
        <div className="card stat">
          <b>{students.length}</b>
          <span>{t.teach.students}</span>
        </div>
        <div className="card stat">
          <b>{pct(classAvg)}</b>
          <span>{t.teach.avg}</span>
        </div>
        <div className="card stat">
          <b>{attempts.length}</b>
          <span>{t.teach.attempts}</span>
        </div>
        <div className="card stat">
          <b style={{ color: needHelp.length ? "var(--warn)" : undefined }}>{needHelp.length}</b>
          <span>{t.teach.needHelp}</span>
        </div>
      </div>

      <section className="stack">
        <h2>{t.teach.colStudent}</h2>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>{t.teach.colStudent}</th>
                <th className="num">{t.teach.colTries}</th>
                <th className="num">{t.teach.colAcc}</th>
                <th>{t.teach.colDone}</th>
                <th>{t.teach.colWeak}</th>
                <th>{t.teach.colLast}</th>
                <th>{t.teach.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{pct(r.avg)}</td>
                  <td>
                    {r.done}/{assignments.length}
                  </td>
                  <td className="small">
                    {r.worst.length
                      ? r.worst.map(([k]) => {
                          const [lid, bar] = k.split(":").map(Number);
                          return (
                            <span key={k} className="badge" style={{ marginRight: 4 }} title={lessons.find((l) => l.id === lid)?.title}>
                              {fmt(t.teach.weakBar, { lesson: lid, bar: bar + 1 })}
                            </span>
                          );
                        })
                      : "-"}
                  </td>
                  <td className="xs">{thDate(r.last?.created_at)}</td>
                  <td>
                    {r.avg == null ? (
                      <span className="badge">{t.learn.notStarted}</span>
                    ) : r.avg >= 0.85 ? (
                      <span className="badge ok">{t.teach.stGood}</span>
                    ) : r.avg >= 0.7 ? (
                      <span className="badge l2">{t.teach.stGrowing}</span>
                    ) : (
                      <span className="badge warn">{t.teach.stHelp}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <h2>{t.teach.heat}</h2>
        <div className="grid cols-3">
          {heat.map(({ l, counts, tries }) => {
            const max = Math.max(1, ...counts);
            return (
              <div key={l.id} className="card">
                <div className="row between">
                  <Link href={`/learn/${l.id}`}>
                    <b>{l.title}</b>
                  </Link>
                  <span className="xs muted">{fmt(t.common.times, { n: tries })}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(16, counts.length)}, minmax(0, 1fr))`, gap: 3 }}>
                  {counts.map((c, b) => (
                    <div
                      key={b}
                      title={fmt(t.teach.heatCell, { bar: b + 1, n: c })}
                      style={{
                        aspectRatio: "1",
                        borderRadius: 4,
                        background: c ? `color-mix(in srgb, var(--crit) ${Math.round(15 + (c / max) * 70)}%, var(--sunk))` : "var(--sunk)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "0.62rem",
                        color: c / max > 0.5 ? "var(--paper)" : "var(--muted)",
                      }}
                    >
                      {b + 1}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid cols-2">
        <section className="card">
          <h2>{t.teach.assigned}</h2>
          {assignments.map((a) => (
            <div key={a.id} className="row between small">
              <span>{a.title}</span>
              <span className="muted">{fmt(t.common.dueBy, { date: thDate(a.due_on) })}</span>
            </div>
          ))}
          <hr className="sep" />
          <form action={assignLesson} className="stack">
            <div className="grid cols-2">
              <label>
                {t.teach.lesson}
                <select id="assign-lesson" name="lessonId">
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.teach.due}
                <input id="assign-due" name="dueOn" type="date" required />
              </label>
            </div>
            <button className="btn" type="submit">
              {fmt(t.teach.assignTo, { cls })}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>{t.teach.fromArchive}</h2>
          <p className="small muted">{t.teach.fromArchiveLede}</p>
          <form action={lessonFromSegment} className="stack">
            <label>
              {t.teach.source}
              <select id="seg" name="segmentId">
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.work} · {s.variant} · {s.person} ({s.code})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid cols-2">
              <label>
                {t.teach.lessonTitle}
                <input id="lesson-title" name="title" type="text" required />
              </label>
              <label>
                {t.teach.grade}
                <input id="lesson-grade" name="grade" type="text" defaultValue="ม.1 ถึง ม.3" />
              </label>
              <label>
                {t.teach.indicator}
                <input id="lesson-ind" name="indicator" type="text" defaultValue="ศ 2.2 ม.2/1" />
              </label>
              <label>
                {t.teach.difficulty}
                <select id="lesson-diff" name="difficulty" defaultValue="2">
                  <option value="1">{t.teach.d1}</option>
                  <option value="2">{t.teach.d2}</option>
                  <option value="3">{t.teach.d3}</option>
                </select>
              </label>
            </div>
            <label>
              {t.teach.description}
              <input id="lesson-desc" name="description" type="text" />
            </label>
            <button className="btn alt" type="submit" disabled={!segments.length}>
              {t.teach.create}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
