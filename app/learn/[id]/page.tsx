import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { canSee } from "@/lib/access";
import { getLesson, lessonLevel } from "@/lib/lessons";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { AccessBadge } from "@/components/AccessBadge";
import { PracticeCoach } from "@/components/PracticeCoach";
import { Icon } from "@/components/ui/Icon";
import { lessonMedia } from "@/lib/studio";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, { t }] = await Promise.all([params, getUser(), getT()]);
  const l = getLesson(Number(id));
  if (!l) notFound();
  const level = lessonLevel(l);
  const media = lessonMedia(l.id);
  if (!canSee(user.role, level)) {
    return (
      <main id="main" className="page">
        <div className="empty">
          <Icon name="lock" size={28} />
          <p>{t.learn.locked}</p>
          <Link className="btn" href="/login">
            {t.shell.signIn}
          </Link>
        </div>
      </main>
    );
  }
  return (
    <main id="main" className="page">
      <div className="page-head">
        <Link href="/learn" className="small">
          <Icon name="back" size={16} />
          {t.learn.all}
        </Link>
        <div className="row">
          <h1>{l.title}</h1>
          <AccessBadge level={level} />
        </div>
        <p>{l.description}</p>
        <div className="row small muted">
          <span>{l.instrument}</span>
          <span>{l.grade}</span>
          <span className="mono">{fmt(t.learn.indicator, { code: l.indicator ?? "-" })}</span>
          {l.person && (
            <span>
              {t.learn.taughtBy} <b>{l.person}</b> · {l.variant}
            </span>
          )}
        </div>
      </div>
      {media.length > 0 && (
        <section className="grid cols-3" aria-label={t.learn.media}>
          {media.map((m) => (
            <figure key={m.id} className="card" style={{ position: "relative" }}>
              {m.kind === "video" ? (
                <video src={`/api/studio/file/${m.id}`} controls playsInline style={{ width: "100%", borderRadius: "var(--r-media)" }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/studio/file/${m.id}`} alt={m.prompt_th ?? ""} style={{ width: "100%", borderRadius: "var(--r-media)" }} />
              )}
              <figcaption className="xs muted">
                <span className="badge warn">{t.common.aiGenerated}</span> {t.common.illustration}
                {m.prompt_th ? ` · ${m.prompt_th}` : ""}
              </figcaption>
            </figure>
          ))}
        </section>
      )}
      <PracticeCoach lesson={{ id: l.id, title: l.title, notation: l.notation, tempo: l.tempo, base_hz: l.base_hz }} canSave={user.role === "student"} />
    </main>
  );
}
