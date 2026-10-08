import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { canSee } from "@/lib/access";
import { getLesson, lessonLevel } from "@/lib/lessons";
import { instrument, instrumentName } from "@/lib/instruments";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { PRACTICE_UI } from "@/lib/i18n/practice-ui";
import { AccessBadge } from "@/components/AccessBadge";
import { Icon } from "@/components/ui/Icon";
import { InstrumentGlyph } from "@/components/practice/InstrumentGlyph";
import { PracticeStage } from "@/components/practice/PracticeStage";
import { lessonMedia } from "@/lib/studio";
import "../learn.css";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, { t, locale }] = await Promise.all([params, getUser(), getT()]);
  const P = PRACTICE_UI[locale];
  const l = getLesson(Number(id));
  if (!l) notFound();
  const level = lessonLevel(l);
  const inst = instrument(l.instrument_id) ?? instrument(1);
  const kind = inst?.play_kind ?? "bars";
  const register = inst?.play_register ?? 0;
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
  const media = lessonMedia(l.id);

  const header = (
    <>
      <Link href={`/learn${inst ? `?i=${inst.id}` : ""}`} className="p-back">
        <Icon name="back" size={16} />
        {t.learn.all}
      </Link>
      <div className="p-title">
        {inst && <InstrumentGlyph kind={kind} register={register} size={48} />}
        <div>
          <h1>{l.title}</h1>
          <div className="p-chips">
            {inst && <span className="p-chip gold">{instrumentName(inst, locale)}</span>}
            <AccessBadge level={level} />
            <span className="p-chip">{fmt(P.tempo, { n: l.tempo })}</span>
            {l.indicator && <span className="p-chip mono">{fmt(t.learn.indicator, { code: l.indicator })}</span>}
            {l.person && (
              <span className="p-chip">
                {t.learn.taughtBy} {l.person}
                {l.variant ? ` · ${l.variant}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
      {l.description && <p className="p-desc">{l.description}</p>}
    </>
  );

  return (
    <main id="main" className="learn-page">
      <PracticeStage lesson={{ id: l.id, title: l.title, notation: l.notation, tempo: l.tempo, base_hz: l.base_hz }} kind={kind} register={register} canSave={user.role === "student"} header={header} />
      {media.length > 0 && (
        <section className="grid cols-3 learn-media" aria-label={t.learn.media}>
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
    </main>
  );
}
