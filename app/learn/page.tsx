import Link from "next/link";
import { getUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { lessonLevel, visibleLessons } from "@/lib/lessons";
import { AccessBadge } from "@/components/AccessBadge";
import { pct, thDate } from "@/lib/format";

export default async function LearnPage() {
  const user = await getUser();
  const lessons = visibleLessons(user.role);
  const mine = user.id
    ? all<{ lesson_id: number; best: number; n: number }>("SELECT lesson_id, MAX(accuracy) AS best, COUNT(*) AS n FROM practice_attempts WHERE user_id = ? GROUP BY lesson_id", user.id)
    : [];
  const due = user.class_name
    ? all<{ lesson_id: number; due_on: string }>("SELECT lesson_id, due_on FROM assignments WHERE class_name = ? ORDER BY due_on", user.class_name)
    : [];
  return (
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">ฝึกเล่น</div>
        <h1>บทเรียนระนาดเอก</h1>
        <p>เลือกบทเรียน ฟังตัวอย่าง แล้วฝึกตามด้วยระนาดบนจอหรือเครื่องจริง โค้ช AI จะบอกว่าห้องไหนต้องฝึกซ้ำ</p>
      </div>
      {due.length > 0 && (
        <div className="notice">
          งานที่ครูมอบหมาย:{" "}
          {due.map((d, i) => (
            <span key={i}>
              {lessons.find((l) => l.id === d.lesson_id)?.title ?? `บทเรียน #${d.lesson_id}`} (ส่งภายใน {thDate(d.due_on)}){i < due.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}
      <div className="grid cols-3">
        {lessons.map((l) => {
          const m = mine.find((x) => x.lesson_id === l.id);
          return (
            <Link key={l.id} href={`/learn/${l.id}`} className="card">
              <div className="row between">
                <span className="badge ind">ระดับ {l.difficulty}</span>
                <AccessBadge level={lessonLevel(l)} />
              </div>
              <h3>{l.title}</h3>
              <p className="small muted">{l.description}</p>
              <div className="row xs muted">
                <span>{l.grade}</span>
                <span className="mono">{l.indicator}</span>
                {l.person && <span>จาก {l.person}</span>}
              </div>
              {m && (
                <div className="xs">
                  ฝึกแล้ว {m.n} ครั้ง · ดีที่สุด <b>{pct(m.best)}</b>
                </div>
              )}
            </Link>
          );
        })}
      </div>
      {lessons.length === 0 && <div className="empty">ยังไม่มีบทเรียนในระดับสิทธิ์ของคุณ</div>}
    </main>
  );
}
