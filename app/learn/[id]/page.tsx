import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { canSee } from "@/lib/access";
import { getLesson, lessonLevel } from "@/lib/lessons";
import { AccessBadge } from "@/components/AccessBadge";
import { PracticeCoach } from "@/components/PracticeCoach";
import { lessonMedia } from "@/lib/studio";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const l = getLesson(Number(id));
  if (!l) notFound();
  const level = lessonLevel(l);
  const media = lessonMedia(l.id);
  if (!canSee(user.role, level)) {
    return (
      <main className="page">
        <div className="notice warn">บทเรียนนี้อยู่ในระดับสิทธิ์ที่คุณยังเข้าถึงไม่ได้ <Link href="/login">เข้าสู่ระบบ</Link></div>
      </main>
    );
  }
  return (
    <main className="page">
      <div className="page-head">
        <Link href="/learn" className="small">
          ← บทเรียนทั้งหมด
        </Link>
        <div className="row">
          <h1>{l.title}</h1>
          <AccessBadge level={level} />
        </div>
        <p>{l.description}</p>
        <div className="row small muted">
          <span>{l.instrument}</span>
          <span>{l.grade}</span>
          <span className="mono">ตัวชี้วัด {l.indicator}</span>
          {l.person && (
            <span>
              ถ่ายทอดโดย <b>{l.person}</b> · {l.variant}
            </span>
          )}
        </div>
      </div>
      {media.length > 0 && (
        <section className="grid cols-3" aria-label="สื่อประกอบบทเรียน">
          {media.map((m) => (
            <figure key={m.id} className="card" style={{ margin: 0, position: "relative" }}>
              {m.kind === "video" ? (
                <video src={`/api/studio/file/${m.id}`} controls playsInline style={{ width: "100%", borderRadius: 8 }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/studio/file/${m.id}`} alt={m.prompt_th ?? ""} style={{ width: "100%", borderRadius: 8 }} />
              )}
              <figcaption className="xs muted">
                <span className="badge warn">สร้างโดย AI</span> ภาพประกอบ ไม่ใช่การบันทึกจริง{m.prompt_th ? ` · ${m.prompt_th}` : ""}
              </figcaption>
            </figure>
          ))}
        </section>
      )}
      <PracticeCoach lesson={{ id: l.id, title: l.title, notation: l.notation, tempo: l.tempo, base_hz: l.base_hz }} canSave={user.role === "student"} />
    </main>
  );
}
