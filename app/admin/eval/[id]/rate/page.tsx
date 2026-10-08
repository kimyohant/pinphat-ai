import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { EVAL_UI } from "@/lib/i18n/eval-ui";
import { blindAnswers, getSet, items, myScores, raterProgress, snapshot } from "@/lib/evals";
import { AccessBadge } from "@/components/AccessBadge";
import { DeskHead } from "@/components/desk/DeskHead";
import { Icon } from "@/components/ui/Icon";
import { saveRatings } from "../../actions";

/** ให้คะแนนแบบปกปิดทีละข้อ: คำตอบสลับลำดับ ไม่มีชื่อโมเดล */
export default async function RatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ i?: string; saved?: string }> }) {
  const user = await requireRole("curator");
  const { id } = await params;
  const sp = await searchParams;
  const set = getSet(Number(id));
  if (!set) notFound();
  const { t, locale } = await getT();
  const ui = EVAL_UI[locale];
  const its = items(set.id);
  const prog = raterProgress(set.id, user.id);
  const index = Math.min(Math.max(0, Number(sp.i) || 0), Math.max(0, its.length - 1));
  const it = its[index];
  const answers = it ? blindAnswers(it.id, user.id) : [];
  const scored = new Map(it ? myScores(it.id, user.id).map((s) => [s.answer_id, s]) : []);
  const src = it ? snapshot(it) : [];

  const Scale = ({ name, value }: { name: string; value?: number }) => (
    <div className="seg score" role="radiogroup">
      {[1, 2, 3, 4, 5].map((v) => (
        <label key={v}>
          <input type="radio" name={name} value={v} defaultChecked={value === v} />
          {v}
        </label>
      ))}
    </div>
  );

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={set.name}
        title={ui.rateTitle}
        lede={ui.rateLede}
        stats={[
          { value: `${prog.done}/${prog.total}`, label: ui.ratedItems },
          { value: answers.length, label: ui.colModel },
        ]}
      >
        <Link className="btn ghost sm" href={`/admin/eval/${set.id}`}>
          <Icon name="back" size={16} />
          {ui.results}
        </Link>
      </DeskHead>
      {sp.saved && <div className="notice ok">{ui.saved}</div>}

      {!it || answers.length === 0 ? (
        <div className="empty">{ui.noAnswers}</div>
      ) : (
        <form action={saveRatings} className="stack-lg">
          <input type="hidden" name="setId" value={set.id} />
          <input type="hidden" name="index" value={index} />
          <input type="hidden" name="answerIds" value={answers.map((a) => a.answerId).join(",")} />

          <section className="card">
            <div className="row between">
              <span className="eyebrow">{fmt(ui.itemOf, { i: index + 1, n: its.length })}</span>
              <span className={`badge ${it.answerable ? "ok" : "warn"}`}>{it.answerable ? ui.answerable : ui.unanswerable}</span>
            </div>
            <h2>{it.question}</h2>
            <details open>
              <summary className="small">{ui.showRef}</summary>
              <p className="small">{it.reference}</p>
            </details>
            <details>
              <summary className="small">{fmt(ui.showSources, { n: src.length })}</summary>
              <div className="stack">
                {src.map((s, k) => (
                  <div key={s.id} className="small">
                    <b>
                      [{k + 1}] {s.title}
                    </b>{" "}
                    <AccessBadge level={s.access_level} />
                    <p className="muted">{s.text}</p>
                  </div>
                ))}
              </div>
            </details>
          </section>

          {answers.map((a) => {
            const prev = scored.get(a.answerId);
            return (
              <section key={a.answerId} className="card blind-answer">
                <div className="row">
                  <span className="letter" aria-hidden="true">
                    {a.letter}
                  </span>
                  <h3>{fmt(ui.answer, { letter: a.letter })}</h3>
                </div>
                <div className="text">{a.answer}</div>
                <div className="criteria">
                  <div>
                    {ui.accuracy}
                    <Scale name={`acc_${a.answerId}`} value={prev?.accuracy} />
                  </div>
                  <div>
                    {ui.grounding}
                    <Scale name={`gro_${a.answerId}`} value={prev?.grounding} />
                  </div>
                  <div>
                    {ui.language}
                    <Scale name={`lan_${a.answerId}`} value={prev?.language} />
                  </div>
                  <div>
                    {ui.decision}
                    <div className="seg score" role="radiogroup">
                      <label>
                        <input type="radio" name={`dec_${a.answerId}`} value="1" defaultChecked={prev?.decision_ok === 1} />
                        {ui.yes}
                      </label>
                      <label>
                        <input type="radio" name={`dec_${a.answerId}`} value="0" defaultChecked={prev?.decision_ok === 0} />
                        {ui.no}
                      </label>
                    </div>
                    <span className="xs muted" style={{ fontWeight: 400 }}>
                      {ui.decisionHint}
                    </span>
                  </div>
                </div>
                <label>
                  {ui.comment}
                  <input name={`com_${a.answerId}`} type="text" defaultValue={prev?.comment ?? ""} />
                </label>
              </section>
            );
          })}

          <div className="row between">
            <div className="row">
              {index > 0 && (
                <Link className="btn ghost" href={`/admin/eval/${set.id}/rate?i=${index - 1}`}>
                  {ui.prev}
                </Link>
              )}
              {index < its.length - 1 && (
                <Link className="btn ghost" href={`/admin/eval/${set.id}/rate?i=${index + 1}`}>
                  {ui.next}
                </Link>
              )}
            </div>
            <div className="row">
              <span className="xs muted">{ui.scale}</span>
              <button className="btn" type="submit">
                <Icon name="check" size={16} />
                {ui.save}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
