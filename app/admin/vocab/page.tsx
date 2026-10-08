import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { usage } from "@/lib/admin";
import { AdminTabs } from "@/components/AdminTabs";
import { DeskHead } from "@/components/desk/DeskHead";
import { mergeVocab, saveVocab } from "../actions";

type Kind = "work" | "variant" | "instrument" | "person";

export default async function VocabPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; merged?: string }> }) {
  const me = await requireRole("admin", "curator");
  const sp = await searchParams;
  const tab: Kind = (["work", "variant", "instrument", "person"] as const).find((k) => k === sp.tab) ?? "work";
  const { t } = await getT();
  const u = usage();
  const works = all<{ id: number; title: string; alt_titles: string | null; genre: string | null; description: string | null }>("SELECT * FROM works ORDER BY title");
  const variants = all<{ id: number; work_id: number; name: string; description: string | null; person: string | null }>(
    "SELECT v.*, p.display_name AS person FROM variants v LEFT JOIN persons p ON p.id = v.person_id ORDER BY v.work_id, v.name",
  );
  const instruments = all<{ id: number; name_th: string; name_lo: string | null; name_en: string | null; family: string | null; description: string | null }>("SELECT * FROM instruments ORDER BY id");
  const persons = all<{ id: number; display_name: string; is_pseudonym: number; province: string | null; district: string | null; bio: string | null }>("SELECT * FROM persons ORDER BY display_name");
  const TABS: { k: Kind; label: string; count: number }[] = [
    { k: "work", label: t.admin.vWorks, count: works.length },
    { k: "variant", label: t.admin.vVariants, count: variants.length },
    { k: "instrument", label: t.admin.vInstruments, count: instruments.length },
    { k: "person", label: t.admin.vPersons, count: persons.length },
  ];

  const Merge = ({ kind, id, options }: { kind: Kind; id: number; options: { id: number; label: string }[] }) =>
    options.length > 1 ? (
      <details className="small">
        <summary>{t.admin.mergeInto}</summary>
        <form action={mergeVocab} className="row" style={{ marginTop: 6 }}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <select name="into" required defaultValue="" aria-label={t.admin.mergeInto} style={{ width: "auto", flex: 1 }}>
            <option value="" disabled>
              —
            </option>
            {options
              .filter((o) => o.id !== id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
          <label className="check xs">
            <input type="checkbox" name="confirm" value="yes" required /> {t.admin.mergeConfirm}
          </label>
          <button className="btn danger sm" type="submit">
            {t.admin.merge}
          </button>
        </form>
      </details>
    ) : null;

  return (
    <main id="main" className="page">
      <DeskHead eyebrow={t.admin.eyebrow} title={t.admin.tabVocab} lede={t.admin.vocabLede} stats={TABS.map((x) => ({ value: x.count, label: x.label }))} />
      <AdminTabs t={t} active="vocab" role={me.role} />
      {sp.saved && <div className="notice ok">{t.admin.saved}</div>}
      {sp.merged && <div className="notice ok">{fmt(t.admin.merged, { n: sp.merged })}</div>}
      <nav className="seg links" aria-label={t.admin.tabVocab}>
        {TABS.map((x) => (
          <Link key={x.k} href={`/admin/vocab?tab=${x.k}`} aria-current={x.k === tab ? "page" : undefined}>
            {x.label} <span className="n">{x.count}</span>
          </Link>
        ))}
      </nav>

      <div className="grid cols-2">
        {tab === "work" &&
          works.map((w) => (
            <article key={w.id} id={`work-${w.id}`} className="card">
              <form action={saveVocab} className="stack">
                <input type="hidden" name="kind" value="work" />
                <input type="hidden" name="id" value={w.id} />
                <div className="row between">
                  <span className="mono xs muted">#{w.id}</span>
                  <span className="xs muted">{fmt(t.admin.used, { n: u.works.get(w.id) ?? 0 })}</span>
                </div>
                <label>
                  {t.admin.titleTh}
                  <input name="title" type="text" defaultValue={w.title} required />
                </label>
                <div className="grid cols-2">
                  <label>
                    {t.admin.altTitles}
                    <input name="altTitles" type="text" defaultValue={w.alt_titles ?? ""} />
                  </label>
                  <label>
                    {t.admin.genre}
                    <input name="genre" type="text" defaultValue={w.genre ?? ""} />
                  </label>
                </div>
                <label>
                  {t.admin.description}
                  <textarea name="description" defaultValue={w.description ?? ""} style={{ minHeight: 60 }} />
                </label>
                <button className="btn ghost sm" type="submit">
                  {t.admin.save}
                </button>
              </form>
              <Merge kind="work" id={w.id} options={works.map((x) => ({ id: x.id, label: x.title }))} />
            </article>
          ))}

        {tab === "variant" &&
          variants.map((v) => (
            <article key={v.id} id={`variant-${v.id}`} className="card">
              <form action={saveVocab} className="stack">
                <input type="hidden" name="kind" value="variant" />
                <input type="hidden" name="id" value={v.id} />
                <div className="row between">
                  <span className="mono xs muted">#{v.id}</span>
                  <span className="xs muted">
                    {v.person && `${t.admin.sourcePerson}: ${v.person} · `}
                    {fmt(t.admin.used, { n: u.variants.get(v.id) ?? 0 })}
                  </span>
                </div>
                <div className="grid cols-2">
                  <label>
                    {t.admin.titleTh}
                    <input name="name" type="text" defaultValue={v.name} required />
                  </label>
                  <label>
                    {t.admin.workOf}
                    <select name="workId" defaultValue={v.work_id}>
                      {works.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  {t.admin.description}
                  <textarea name="description" defaultValue={v.description ?? ""} style={{ minHeight: 60 }} />
                </label>
                <button className="btn ghost sm" type="submit">
                  {t.admin.save}
                </button>
              </form>
              <Merge
                kind="variant"
                id={v.id}
                options={variants.filter((x) => x.work_id === v.work_id).map((x) => ({ id: x.id, label: `${works.find((w) => w.id === x.work_id)?.title} · ${x.name}` }))}
              />
            </article>
          ))}

        {tab === "instrument" &&
          instruments.map((i) => (
            <article key={i.id} id={`instrument-${i.id}`} className="card">
              <form action={saveVocab} className="stack">
                <input type="hidden" name="kind" value="instrument" />
                <input type="hidden" name="id" value={i.id} />
                <div className="row between">
                  <span className="mono xs muted">#{i.id}</span>
                  <span className="xs muted">{fmt(t.admin.used, { n: u.instruments.get(i.id) ?? 0 })}</span>
                </div>
                <div className="grid cols-3">
                  <label>
                    {t.admin.titleTh}
                    <input name="nameTh" type="text" defaultValue={i.name_th} required />
                  </label>
                  <label>
                    {t.admin.nameLo}
                    <input name="nameLo" type="text" defaultValue={i.name_lo ?? ""} className="lao" />
                  </label>
                  <label>
                    {t.admin.nameEn}
                    <input name="nameEn" type="text" defaultValue={i.name_en ?? ""} />
                  </label>
                </div>
                <label>
                  {t.admin.family}
                  <input name="family" type="text" defaultValue={i.family ?? ""} />
                </label>
                <label>
                  {t.admin.description}
                  <textarea name="description" defaultValue={i.description ?? ""} style={{ minHeight: 60 }} />
                </label>
                <button className="btn ghost sm" type="submit">
                  {t.admin.save}
                </button>
              </form>
            </article>
          ))}

        {tab === "person" &&
          persons.map((p) => (
            <article key={p.id} id={`person-${p.id}`} className="card">
              <form action={saveVocab} className="stack">
                <input type="hidden" name="kind" value="person" />
                <input type="hidden" name="id" value={p.id} />
                <div className="row between">
                  <span className="mono xs muted">#{p.id}</span>
                  <span className="xs muted">{fmt(t.admin.used, { n: u.persons.get(p.id) ?? 0 })}</span>
                </div>
                <label>
                  {t.admin.displayName}
                  <input name="displayName" type="text" defaultValue={p.display_name} required />
                </label>
                <label className="check">
                  <input type="checkbox" name="pseudonym" defaultChecked={!!p.is_pseudonym} /> {t.admin.pseudonym}
                </label>
                <div className="grid cols-2">
                  <label>
                    {t.admin.province}
                    <input name="province" type="text" defaultValue={p.province ?? ""} />
                  </label>
                  <label>
                    {t.admin.province2}
                    <input name="district" type="text" defaultValue={p.district ?? ""} />
                  </label>
                </div>
                <label>
                  {t.admin.description}
                  <textarea name="bio" defaultValue={p.bio ?? ""} style={{ minHeight: 60 }} />
                </label>
                <button className="btn ghost sm" type="submit">
                  {t.admin.save}
                </button>
              </form>
              <Merge kind="person" id={p.id} options={persons.map((x) => ({ id: x.id, label: x.display_name }))} />
            </article>
          ))}
      </div>
    </main>
  );
}
