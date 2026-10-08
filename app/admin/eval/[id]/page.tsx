import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { INTL_LOCALE, fmt } from "@/lib/i18n/config";
import { EVAL_UI, runName } from "@/lib/i18n/eval-ui";
import { pct } from "@/lib/format";
import { candidates, getSet, items, raterProgress, results, snapshot, type RunConfig } from "@/lib/evals";
import { AdminTabs } from "@/components/AdminTabs";
import { DeskHead } from "@/components/desk/DeskHead";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Icon } from "@/components/ui/Icon";
import { addItems, removeItem, startEval } from "../actions";

export default async function EvalSetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "curator");
  const expert = user.role === "curator";
  const { id } = await params;
  const set = getSet(Number(id));
  if (!set) notFound();
  const { t, locale } = await getT();
  const ui = EVAL_UI[locale];
  const its = items(set.id);
  const res = results(set.id);
  const running = res.runs.some((r) => r.run.status === "queued" || r.run.status === "running");
  const cands = expert ? await candidates() : [];
  const mine = expert ? raterProgress(set.id, user.id) : null;
  const n1 = (v: number | null) => (v == null ? "-" : v.toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: 2 }));
  const p = (v: number | null) => (v == null ? "-" : pct(v));
  const STATUS: Record<string, [string, string]> = { queued: [ui.stQueued, ""], running: [ui.stRunning, "l2"], done: [ui.stDone, "ok"], failed: [ui.stFailed, "crit"] };
  const NOTE: Record<string, string> = { active: ui.noteActive, missing: ui.noteMissing, publicOnly: ui.notePublic, noKey: ui.noteNoKey };
  const locked = set.runs > 0;

  return (
    <main id="main" className="page">
      {running && <AutoRefresh seconds={4} />}
      <DeskHead
        eyebrow={ui.title}
        title={set.name}
        lede={set.description ?? undefined}
        stats={[
          { value: its.length, label: ui.question },
          { value: its.filter((i) => !i.answerable).length, label: ui.unanswerable },
          { value: res.runs.length, label: ui.runsTitle },
          { value: res.raters, label: ui.ratersLabel },
        ]}
      >
        <Link className="btn ghost sm" href="/admin/eval">
          <Icon name="back" size={16} />
          {ui.back}
        </Link>
        {expert && res.runs.some((r) => r.run.status === "done") && (
          <Link className="btn gold sm" href={`/admin/eval/${set.id}/rate`}>
            <Icon name="check" size={16} />
            {ui.rate} · {fmt(ui.progress, { done: mine?.done ?? 0, total: mine?.total ?? 0 })}
          </Link>
        )}
      </DeskHead>
      <AdminTabs t={t} active="eval" role={user.role} />
      {!expert && <div className="notice">{ui.adminOnly}</div>}

      <section className="stack">
        <div className="sec-head">
          <div>
            <h2>{ui.results}</h2>
            <p className="small">{res.raters >= 2 && res.agreement != null ? fmt(ui.agreement, { pct: pct(res.agreement), k: n1(res.kappa) }) : ui.needTwo}</p>
          </div>
          {expert && (
            <a className="btn ghost sm" href={`/api/admin/eval/${set.id}`}>
              <Icon name="arrow" size={16} />
              {ui.exportCsv}
            </a>
          )}
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>{ui.colModel}</th>
                <th className="num">{ui.colAnswered}</th>
                <th className="num">{ui.colLatency}</th>
                <th className="num">{ui.colCite}</th>
                <th className="num">{ui.colAutoHalluc}</th>
                <th className="num">{ui.colAccuracy}</th>
                <th className="num">{ui.colGrounding}</th>
                <th className="num">{ui.colLanguage}</th>
                <th className="num">{ui.colDecision}</th>
                <th className="num">{ui.colHalluc}</th>
                <th className="num">{ui.colRated}</th>
              </tr>
            </thead>
            <tbody>
              {res.runs.map((r) => (
                <tr key={r.run.id}>
                  <td>
                    <b>{runName(JSON.parse(r.run.config) as RunConfig, ui)}</b>
                    <div className="row xs">
                      <span className={`badge ${STATUS[r.run.status]?.[1] ?? ""}`}>
                        {STATUS[r.run.status]?.[0] ?? r.run.status}
                        {r.run.status === "running" ? ` ${r.run.progress}%` : ""}
                      </span>
                      {r.run.error && <span className="muted">{r.run.error}</span>}
                    </div>
                  </td>
                  <td className="num">
                    {r.answered}
                    {r.skipped > 0 && <span className="xs muted"> (+{r.skipped})</span>}
                  </td>
                  <td className="num">{r.latency == null ? "-" : fmt(ui.seconds, { n: n1(r.latency / 1000) })}</td>
                  <td className="num">{p(r.citeOk)}</td>
                  <td className="num">{p(r.autoAbstainWrong)}</td>
                  <td className="num">{n1(r.accuracy)}</td>
                  <td className="num">{n1(r.grounding)}</td>
                  <td className="num">{n1(r.language)}</td>
                  <td className="num">{p(r.decisionOk)}</td>
                  <td className="num">{p(r.hallucination)}</td>
                  <td className="num">
                    {r.rated}/{r.answered}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted">{ui.autoNote}</p>
      </section>

      {expert && (
        <section id="runs" className="card">
          <h3>{ui.runsTitle}</h3>
          <form action={startEval} className="row">
            <input type="hidden" name="setId" value={set.id} />
            <select id="candidate" name="candidate" aria-label={ui.pick} style={{ flex: 1, width: "auto", minWidth: 260 }}>
              {cands.map((c) => (
                <option key={c.key} value={c.key} disabled={!c.available}>
                  {runName(c.config, ui)}
                  {c.note ? ` · ${NOTE[c.note]}` : ""}
                </option>
              ))}
            </select>
            <button className="btn" type="submit" disabled={!its.length}>
              <Icon name="play" size={16} />
              {ui.start}
            </button>
          </form>
          <p className="xs muted">{ui.gpuNote}</p>
        </section>
      )}

      {expert && (
        <section className="stack">
          <h2>{ui.questions}</h2>
          {locked && <div className="notice">{ui.lockedItems}</div>}
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{ui.question}</th>
                  <th>{ui.reference}</th>
                  <th>{ui.frozen}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {its.map((it, i) => {
                  const src = snapshot(it);
                  return (
                    <tr key={it.id}>
                      <td className="mono xs">{i + 1}</td>
                      <td>
                        <b>{it.question}</b>
                        <div>
                          <span className={`badge ${it.answerable ? "ok" : "warn"}`}>{it.answerable ? ui.answerable : ui.unanswerable}</span>
                        </div>
                      </td>
                      <td className="small">{it.reference}</td>
                      <td className="xs">
                        {it.sources == null ? ui.notFrozen : src.length ? fmt(ui.sourcesN, { n: src.length }) : ui.noSources}
                        {src.length > 0 && <div className="muted">{src.map((s) => `L${s.access_level}`).join(" ")}</div>}
                      </td>
                      <td>
                        {!locked && (
                          <form action={removeItem.bind(null, it.id, set.id)}>
                            <button className="btn danger sm" type="submit">
                              {ui.remove}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!locked && (
            <form action={addItems} className="card stack">
              <input type="hidden" name="setId" value={set.id} />
              <h3>{ui.addItem}</h3>
              <div className="grid cols-2">
                <label>
                  {ui.question}
                  <input id="q" name="question" type="text" />
                </label>
                <label>
                  {ui.reference}
                  <input id="ref" name="reference" type="text" />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" name="unanswerable" /> {ui.unanswerable}
              </label>
              <label>
                {ui.bulk}
                <textarea id="bulk" name="bulk" placeholder="ครูสอนจับไม้ตีอย่างไร | จับหลวม ๆ ข้อมือไม่เกร็ง |" style={{ minHeight: 90 }} />
                <span className="hint">{ui.bulkHint}</span>
              </label>
              <button className="btn" type="submit">
                {ui.add}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
