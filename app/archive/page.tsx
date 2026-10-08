import Link from "next/link";
import { getUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { json } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtYear } from "@/lib/i18n/config";
import { ARCHIVE_UI } from "@/lib/i18n/archive-ui";
import { initialOf, lineage, peaksOf, persons, shortName, visibleSegments, visibleTunings, works } from "@/lib/archive";
import { instrumentName, instruments } from "@/lib/instruments";
import { AccessBadge } from "@/components/AccessBadge";
import { TuningChart } from "@/components/TuningChart";
import { Waveform } from "@/components/Waveform";
import { Icon } from "@/components/ui/Icon";
import { ArchiveSearch } from "@/components/archive/ArchiveSearch";
import { ProvinceMap } from "@/components/archive/ProvinceMap";
import { Constellation } from "@/components/archive/Constellation";
import { InstrumentGlyph } from "@/components/practice/InstrumentGlyph";
import { dur } from "@/lib/format";
import "./archive.css";

const TABS = ["masters", "works", "recordings", "interviews", "instruments", "lineage"] as const;
type Tab = (typeof TABS)[number];

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ tab?: string; prov?: string }> }) {
  const [user, { t, locale }, sp] = await Promise.all([getUser(), getT(), searchParams]);
  const A = ARCHIVE_UI[locale];
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "masters";
  const ppl = persons();
  const segs = visibleSegments(user.role);
  const perf = segs.filter((s) => s.kind === "performance" || s.kind === "teaching");
  const interviews = segs.filter((s) => s.kind === "interview");
  const recordings = segs.filter((s) => s.asset_id);
  const ws = works();
  const insts = instruments();
  const tunings = visibleTunings(user.role);
  const variants = one<{ n: number }>("SELECT COUNT(*) AS n FROM variants")?.n ?? 0;
  const minutes = recordings.reduce((a, s) => a + (s.duration_s ?? 0), 0) / 60;
  const provCount: Record<string, number> = {};
  ppl.forEach((p) => p.province && (provCount[p.province] = (provCount[p.province] ?? 0) + 1));
  const prov = sp.prov && provCount[sp.prov] != null ? sp.prov : undefined;
  const shownPeople = prov ? ppl.filter((p) => p.province === prov) : ppl;
  const of = (pid: number) => ({ rec: recordings.filter((s) => s.person_id === pid).length, int: interviews.filter((s) => s.person_id === pid).length });

  const stats = [
    { v: ppl.filter((p) => p.role === "master").length, l: A.masters },
    { v: ppl.filter((p) => p.role !== "master").length, l: A.artists },
    { v: ws.length, l: A.works },
    { v: variants, l: A.variants },
    { v: minutes.toFixed(1), l: A.minutes },
    { v: interviews.length, l: A.interviews },
    { v: Object.keys(provCount).length, l: A.provinces },
  ];
  const tabLabel: Record<Tab, string> = { masters: A.tabMasters, works: A.tabWorks, recordings: A.tabRecordings, interviews: A.tabInterviews, instruments: A.tabInstruments, lineage: A.tabLineage };
  const tabCount: Record<Tab, number> = { masters: ppl.length, works: ws.length, recordings: recordings.length, interviews: interviews.length, instruments: insts.length, lineage: lineage().length };

  return (
    <main id="main" className="archive-page">
      <section className="astage on-night" aria-labelledby="archive-title">
        <div className="pstage-bg" aria-hidden="true" />
        <div className="ahero">
          <span className="stage-eyebrow">{t.archive.eyebrow}</span>
          <h1 id="archive-title">{A.title}</h1>
          <p>{A.lede}</p>
          <ArchiveSearch />
        </div>

        <div className="astats" aria-label={A.title}>
          {stats.map((s) => (
            <div key={s.l}>
              <b>{s.v}</b>
              <span>{s.l}</span>
            </div>
          ))}
        </div>

        <nav className="atabs" aria-label={t.archive.eyebrow}>
          {TABS.map((k) => (
            <Link key={k} href={k === "masters" ? "/archive" : `/archive?tab=${k}`} scroll={false} aria-current={tab === k ? "page" : undefined}>
              {tabLabel[k]}
              <span>{tabCount[k]}</span>
            </Link>
          ))}
        </nav>

        {tab === "masters" && (
          <div className="amasters">
            <div className="amap-card">
              <div className="amap-head">
                <h2>{A.mapTitle}</h2>
                <span>{A.mapHint}</span>
              </div>
              <ProvinceMap counts={provCount} selected={prov} locale={locale} mekong={A.mekong} note={A.mapNote} title={A.mapTitle} />
            </div>
            <div className="apeople">
              {prov && (
                <div className="afilter">
                  <span>{fmt(A.filterBy, { p: prov })}</span>
                  <Link href="/archive" scroll={false}>
                    <Icon name="close" size={14} />
                    {A.clear}
                  </Link>
                </div>
              )}
              {shownPeople.map((p) => {
                const c = of(p.id);
                return (
                  <Link key={p.id} href={`/archive/person/${p.id}`} className={`aperson${p.role === "master" ? " master" : ""}`}>
                    <span className="aav" aria-hidden="true">
                      {initialOf(p.display_name)}
                    </span>
                    <span className="aperson-body">
                      <b>{shortName(p.display_name)}</b>
                      <small>
                        {p.role === "master" ? A.master : A.artist} · {p.district} · {p.province}
                        {p.birth_year ? ` · ${fmt(t.common.born, { year: fmtYear(p.birth_year, locale) })}` : ""}
                      </small>
                      {p.bio && <span className="aperson-bio">{p.bio}</span>}
                      <span className="aperson-meta">
                        <span>
                          <Icon name="wave" size={12} />
                          {fmt(A.recordingsN, { n: c.rec })}
                        </span>
                        <span>
                          <Icon name="tutor" size={12} />
                          {fmt(A.interviewsN, { n: c.int })}
                        </span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {tab === "works" && (
          <div className="aworks">
            {ws.map((w) => {
              const list = perf.filter((s) => s.work_id === w.id);
              const people = [...new Map(list.map((s) => [s.person_id, s.person])).values()].filter(Boolean) as string[];
              return (
                <Link key={w.id} href={`/archive/work/${w.id}`} className="awork">
                  <span className="awork-top">
                    <span className="badge gold">{w.genre}</span>
                    <span className="awork-n">{fmt(A.variantsN, { n: list.length })}</span>
                  </span>
                  <h3>{w.title}</h3>
                  {w.description && <p>{w.description}</p>}
                  <span className="awork-people">
                    {people.length ? people.map((n) => <i key={n}>{shortName(n)}</i>) : <em>{A.noPerformance}</em>}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {tab === "recordings" && (
          <div className="arecs">
            {recordings.length === 0 && <div className="aempty">{A.empty}</div>}
            {recordings.map((s) => (
              <div key={s.id} id={`seg-${s.id}`} className="arec">
                <div className="arec-top">
                  <span>
                    <b>{s.work ?? t.contentTypes[s.kind as keyof typeof t.contentTypes] ?? s.kind}</b>
                    {s.variant ? ` · ${s.variant}` : ""}
                  </span>
                  <AccessBadge level={s.access_level} />
                </div>
                <span className="arec-meta">
                  {s.person_id ? <Link href={`/archive/person/${s.person_id}`}>{shortName(s.person ?? "")}</Link> : null}
                  {s.instrument && <span>{s.instrument}</span>}
                  <span className="mono">{dur(s.duration_s)}</span>
                  <span className="mono">{s.code}</span>
                </span>
                {peaksOf(s) && <Waveform peaks={peaksOf(s)!} />}
                <audio controls preload="none" src={`/api/media/${s.asset_id}`} />
              </div>
            ))}
          </div>
        )}

        {tab === "interviews" && (
          <div className="aints clamp">
            {interviews.length === 0 && <div className="aempty">{A.empty}</div>}
            {interviews.map((s) => (
              <article key={s.id} id={`seg-${s.id}`} className="aint">
                <header>
                  <span className="aav sm" aria-hidden="true">
                    {initialOf(s.person ?? "?")}
                  </span>
                  <span>
                    {s.person_id ? <Link href={`/archive/person/${s.person_id}`}>{shortName(s.person ?? "")}</Link> : null}
                    <small>{s.province}</small>
                  </span>
                  <AccessBadge level={s.access_level} />
                </header>
                <p>{s.transcript}</p>
                <footer className="row between">
                  <span className="mono">
                    {s.code} · #{s.id}
                  </span>
                  {s.person_id && (
                    <Link href={`/archive/person/${s.person_id}#seg-${s.id}`} className="aint-more">
                      {A.open}
                    </Link>
                  )}
                </footer>
              </article>
            ))}
          </div>
        )}

        {tab === "instruments" && (
          <div className="ainsts">
            {insts.map((i) => {
              const tu = tunings.filter((x) => x.instrument_id === i.id);
              return (
                <div key={i.id} className="ainst">
                  <div className="ainst-head">
                    <InstrumentGlyph kind={i.play_kind} register={i.play_register} size={56} />
                    <div>
                      <h3>{instrumentName(i, locale)}</h3>
                      <small>{[i.name_th, i.name_lo, i.name_en].filter((n) => n && n !== instrumentName(i, locale)).join(" · ")}</small>
                    </div>
                    <span className="badge">{i.family}</span>
                  </div>
                  {i.description && <p>{i.description}</p>}
                  {tu.map((x, k) => (
                    <div key={k} className="ainst-tune">
                      <span>
                        {A.tuning} · {x.person_id ? <Link href={`/archive/person/${x.person_id}`}>{shortName(x.person ?? "")}</Link> : null} · ด = {x.base_hz} Hz
                      </span>
                      <TuningChart steps={json(x.steps, [])} title={t.viz.tuning} axis={t.viz.tuningAxis} />
                    </div>
                  ))}
                  <Link href={`/learn?i=${i.id}`} className="ainst-go">
                    <Icon name="learn" size={14} />
                    {t.nav.learn}
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {tab === "lineage" && (
          <div className="alineage">
            <p className="ahint">{A.lineageHint}</p>
            <Constellation persons={ppl} edges={lineage()} label={A.tabLineage} />
          </div>
        )}

        <p className="ademo">{A.demoNote}</p>
      </section>
    </main>
  );
}
