import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { LEVELS, PROVINCES, TK_LABELS } from "@/lib/access";
import { getT } from "@/lib/i18n/server";
import { Icon } from "@/components/ui/Icon";
import { createSession } from "../actions";

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("collector", "curator");
  const { t } = await getT();
  const ERR: Record<string, string> = { missing: t.fieldNew.errMissing, person: t.fieldNew.errPerson };
  const { error } = await searchParams;
  const persons = all<{ id: number; display_name: string; province: string }>("SELECT id, display_name, province FROM persons ORDER BY display_name");
  return (
    <main id="main" className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <Link href="/field" className="small">
          <Icon name="back" size={16} />
          {t.fieldNew.back}
        </Link>
        <h1>{t.fieldNew.title}</h1>
        <p>{t.fieldNew.lede}</p>
      </div>
      {error && <div className="notice crit">{ERR[error] ?? t.fieldNew.errOther}</div>}
      <form action={createSession} className="stack-lg">
        <fieldset>
          <legend>{t.fieldNew.session}</legend>
          <label>
            {t.fieldNew.sessionTitle}
            <input id="title" name="title" type="text" required placeholder={t.fieldNew.sessionTitlePh} />
          </label>
          <div className="grid cols-3">
            <label>
              {t.fieldNew.province}
              <select id="province" name="province" defaultValue="สกลนคร">
                {PROVINCES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              {t.fieldNew.district}
              <input id="district" name="district" type="text" />
            </label>
            <label>
              {t.fieldNew.date}
              <input id="recordedOn" name="recordedOn" type="date" />
            </label>
          </div>
          <label>
            {t.fieldNew.place}
            <input id="place" name="place" type="text" placeholder={t.fieldNew.placePh} />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t.fieldNew.contributor}</legend>
          <label>
            {t.fieldNew.fromRegister}
            <select id="personId" name="personId" defaultValue="">
              <option value="">{t.fieldNew.newPersonOpt}</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} · {p.province}
                </option>
              ))}
            </select>
          </label>
          <div className="grid cols-2">
            <label>
              {t.fieldNew.newName}
              <input id="newPersonName" name="newPersonName" type="text" />
              <span className="hint">{t.fieldNew.newNameHint}</span>
            </label>
            <label>
              {t.fieldNew.role}
              <select id="newPersonRole" name="newPersonRole" defaultValue="master">
                <option value="master">{t.fieldNew.master}</option>
                <option value="artist">{t.fieldNew.artist}</option>
              </select>
            </label>
            <label>
              {t.fieldNew.birthYear}
              <input id="birthYear" name="birthYear" type="number" min={1900} max={2020} />
            </label>
            <label>
              {t.fieldNew.learnedFrom}
              <select id="teacherId" name="teacherId" defaultValue="">
                <option value="">{t.review.unspecified}</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="isPseudonym" defaultChecked /> {t.fieldNew.pseudonym}
          </label>
          <label>
            {t.fieldNew.bio}
            <textarea id="newPersonBio" name="newPersonBio" style={{ minHeight: 70 }} />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t.fieldNew.consent}</legend>
          <div className="radio-cards" role="radiogroup" aria-label={t.consent.levelLabel}>
            {LEVELS.map((l) => (
              <label key={l.level}>
                <input type="radio" name="accessLevel" value={l.level} defaultChecked={l.level === 2} required />
                <b>
                  {l.short} · {t.levels[l.level]}
                </b>
                <span className="xs muted">{t.levelDesc[l.level]}</span>
              </label>
            ))}
          </div>
          <div className="stack">
            <span className="small">{t.fieldNew.tkLabels}</span>
            <div className="grid cols-2">
              {TK_LABELS.map((tk) => (
                <label key={tk.code} className="check">
                  <input type="checkbox" name={`tk:${tk.code}`} defaultChecked={tk.code === "TK A"} />
                  <span>
                    <b className="mono xs">{tk.code}</b> {(t.tk as Record<string, string>)[tk.code]}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid cols-2">
            <label>
              {t.fieldNew.method}
              <select id="method" name="method" defaultValue="voice">
                <option value="signature">{t.fieldNew.mSignature}</option>
                <option value="voice">{t.fieldNew.mVoice}</option>
                <option value="witness">{t.fieldNew.mWitness}</option>
              </select>
            </label>
            <label>
              {t.fieldNew.evidence}
              <input id="evidence" name="evidence" type="file" accept="audio/*,image/*,application/pdf" />
              <span className="hint">{t.fieldNew.evidenceHint}</span>
            </label>
          </div>
          <label>
            {t.fieldNew.scope}
            <textarea id="scopeNote" name="scopeNote" style={{ minHeight: 70 }} placeholder={t.fieldNew.scopePh} />
          </label>
        </fieldset>

        <label>
          {t.fieldNew.notes}
          <textarea id="notes" name="notes" style={{ minHeight: 70 }} />
        </label>
        <div className="row">
          <button className="btn" type="submit">
            {t.fieldNew.submit}
          </button>
          <Link className="btn ghost" href="/field">
            {t.fieldNew.cancel}
          </Link>
        </div>
      </form>
    </main>
  );
}
