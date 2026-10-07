import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { barCount, parseNotation } from "@/lib/notation";
import { json, pct, thDate } from "@/lib/format";
import { visibleLessons } from "@/lib/lessons";
import { assignLesson, lessonFromSegment } from "./actions";

type Attempt = { user_id: number; lesson_id: number; accuracy: number; timing_ms: number; bar_errors: string; created_at: string };

export default async function TeachPage() {
  const user = await requireRole("teacher", "curator");
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
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">ห้องเรียน · {cls}</div>
        <h1>ภาพรวมชั้นเรียน</h1>
        <p>ข้อมูลมาจากการฝึกกับโค้ช AI ของนักเรียน ใช้ดูว่าใครต้องการความช่วยเหลือและห้องไหนของเพลงที่ทั้งชั้นยังติด</p>
      </div>
      <div className="grid cols-4">
        <div className="card stat">
          <b>{students.length}</b>
          <span>นักเรียน</span>
        </div>
        <div className="card stat">
          <b>{pct(classAvg)}</b>
          <span>ความแม่นเฉลี่ย 3 ครั้งล่าสุด</span>
        </div>
        <div className="card stat">
          <b>{attempts.length}</b>
          <span>ครั้งที่ฝึกทั้งหมด</span>
        </div>
        <div className="card stat">
          <b style={{ color: needHelp.length ? "var(--warn)" : undefined }}>{needHelp.length}</b>
          <span>ต้องการความช่วยเหลือ</span>
        </div>
      </div>

      <section className="stack">
        <h2>นักเรียน</h2>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>นักเรียน</th>
                <th className="num">ฝึก (ครั้ง)</th>
                <th className="num">ความแม่นล่าสุด</th>
                <th>งานที่ผ่าน</th>
                <th>ห้องที่ติด</th>
                <th>ฝึกล่าสุด</th>
                <th>สถานะ</th>
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
                              บทที่ {lid} · ห้อง {bar + 1}
                            </span>
                          );
                        })
                      : "-"}
                  </td>
                  <td className="xs">{thDate(r.last?.created_at)}</td>
                  <td>
                    {r.avg == null ? (
                      <span className="badge">ยังไม่เริ่ม</span>
                    ) : r.avg >= 0.85 ? (
                      <span className="badge ok">ดี</span>
                    ) : r.avg >= 0.7 ? (
                      <span className="badge l2">กำลังพัฒนา</span>
                    ) : (
                      <span className="badge warn">ต้องช่วย</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <h2>ห้องที่ทั้งชั้นพลาดบ่อย</h2>
        <div className="grid cols-3">
          {heat.map(({ l, counts, tries }) => {
            const max = Math.max(1, ...counts);
            return (
              <div key={l.id} className="card">
                <div className="row between">
                  <Link href={`/learn/${l.id}`}>
                    <b>{l.title}</b>
                  </Link>
                  <span className="xs muted">{tries} ครั้ง</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(16, counts.length)}, minmax(0, 1fr))`, gap: 3 }}>
                  {counts.map((c, b) => (
                    <div
                      key={b}
                      title={`ห้อง ${b + 1}: พลาด ${c} ครั้ง`}
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
          <h2>งานที่มอบหมาย</h2>
          {assignments.map((a) => (
            <div key={a.id} className="row between small">
              <span>{a.title}</span>
              <span className="muted">ส่งภายใน {thDate(a.due_on)}</span>
            </div>
          ))}
          <hr className="sep" />
          <form action={assignLesson} className="stack">
            <div className="grid cols-2">
              <label>
                บทเรียน
                <select id="assign-lesson" name="lessonId">
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                กำหนดส่ง
                <input id="assign-due" name="dueOn" type="date" required />
              </label>
            </div>
            <button className="btn" type="submit">
              มอบหมายให้ {cls}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>สร้างบทเรียนจากคลัง</h2>
          <p className="small muted">เลือกการบรรเลงที่ผ่านการรับรองแล้ว (ระดับสาธารณะหรือสถานศึกษา) โน้ตและความเร็วจะตั้งให้อัตโนมัติ</p>
          <form action={lessonFromSegment} className="stack">
            <label>
              การบรรเลงต้นทาง
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
                ชื่อบทเรียน
                <input id="lesson-title" name="title" type="text" required />
              </label>
              <label>
                ระดับชั้น
                <input id="lesson-grade" name="grade" type="text" defaultValue="ม.1–ม.3" />
              </label>
              <label>
                ตัวชี้วัด
                <input id="lesson-ind" name="indicator" type="text" defaultValue="ศ 2.2 ม.2/1" />
              </label>
              <label>
                ความยาก
                <select id="lesson-diff" name="difficulty" defaultValue="2">
                  <option value="1">1 · เริ่มต้น</option>
                  <option value="2">2 · กลาง</option>
                  <option value="3">3 · สูง</option>
                </select>
              </label>
            </div>
            <label>
              คำอธิบาย
              <input id="lesson-desc" name="description" type="text" />
            </label>
            <button className="btn alt" type="submit" disabled={!segments.length}>
              สร้างบทเรียน
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
