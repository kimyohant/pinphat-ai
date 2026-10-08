import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { parseNotation } from "@/lib/notation";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { ARCHIVE_UI } from "@/lib/i18n/archive-ui";
import { initialOf, peaksOf, shortName, variantsOf, visibleSegments, work } from "@/lib/archive";
import { AccessBadge } from "@/components/AccessBadge";
import { NotationGrid } from "@/components/NotationGrid";
import { Waveform } from "@/components/Waveform";
import { Icon } from "@/components/ui/Icon";
import "../../archive.css";

export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, { t, locale }] = await Promise.all([params, getUser(), getT()]);
  const A = ARCHIVE_UI[locale];
  const w = work(Number(id));
  if (!w) notFound();
  const perf = visibleSegments(user.role).filter((s) => s.work_id === w.id && (s.kind === "performance" || s.kind === "teaching"));
  const all = variantsOf(w.id);
  const hidden = Math.max(0, all.length - new Set(perf.map((s) => s.variant)).size);

  return (
    <main id="main" className="archive-page">
      <section className="astage on-night">
        <div className="pstage-bg" aria-hidden="true" />
        <Link href="/archive?tab=works" className="p-back">
          <Icon name="back" size={16} />
          {A.back}
        </Link>
        <header className="ahero">
          <span className="stage-eyebrow">{w.genre}</span>
          <h1>{w.title}</h1>
          {w.description && <p>{w.description}</p>}
        </header>

        <div className="asection">
          <h2>{A.compare}</h2>
          <p className="ahint">{A.compareHint}</p>
          {hidden > 0 && <p className="ahint">{fmt(A.hidden, { n: hidden })}</p>}
          {perf.length === 0 && <div className="aempty">{A.noPerformance}</div>}
          <div className="acompare">
            {perf.map((s) => (
              <div key={s.id} className="arec">
                <div className="arec-top">
                  <span className="arec-who">
                    <span className="aav sm">{initialOf(s.person ?? "?")}</span>
                    <span>
                      <b>{s.variant}</b>
                      {s.person_id && <Link href={`/archive/person/${s.person_id}`}>{shortName(s.person ?? "")}</Link>}
                    </span>
                  </span>
                  <AccessBadge level={s.access_level} />
                </div>
                <span className="arec-meta">
                  {s.instrument && <span>{s.instrument}</span>}
                  {s.province && <span>{s.province}</span>}
                  <span className="mono">{s.code}</span>
                </span>
                {peaksOf(s) && <Waveform peaks={peaksOf(s)!} />}
                {s.asset_id && <audio controls preload="none" src={`/api/media/${s.asset_id}`} />}
                {s.notation && <NotationGrid slots={parseNotation(s.notation)} label={t.viz.notation} />}
              </div>
            ))}
          </div>
        </div>
        <p className="ademo">{A.demoNote}</p>
      </section>
    </main>
  );
}
