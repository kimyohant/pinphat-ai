import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { EVAL_UI } from "@/lib/i18n/eval-ui";
import { listSets } from "@/lib/evals";
import { AdminTabs } from "@/components/AdminTabs";
import { DeskHead } from "@/components/desk/DeskHead";
import { Icon } from "@/components/ui/Icon";
import { createSet } from "./actions";

export default async function EvalPage() {
  const user = await requireRole("admin", "curator");
  const { t, locale } = await getT();
  const ui = EVAL_UI[locale];
  const sets = listSets();
  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.admin.eyebrow}
        title={ui.title}
        lede={ui.lede}
        stats={[
          { value: sets.length, label: ui.sets },
          { value: sets.reduce((a, s) => a + s.items, 0), label: ui.question },
          { value: sets.reduce((a, s) => a + s.runs, 0), label: ui.runsTitle },
        ]}
      />
      <AdminTabs t={t} active="eval" role={user.role} />

      <div className={user.role === "curator" ? "split" : "stack"}>
        <section className="stack">
          <h2>{ui.sets}</h2>
          {sets.map((s) => (
            <article key={s.id} className="card">
              <div className="row between">
                <Link href={`/admin/eval/${s.id}`}>
                  <h3>{s.name}</h3>
                </Link>
                <span className="xs muted">{fmtDate(s.created_at, locale)}</span>
              </div>
              {s.description && <p className="small muted">{s.description}</p>}
              <div className="row">
                <span className="badge">{fmt(ui.itemsN, { n: s.items })}</span>
                <span className="badge l2">{fmt(ui.runsN, { n: s.runs })}</span>
                <span className="badge">
                  {ui.levels}: {(JSON.parse(s.levels) as number[]).map((l) => `L${l}`).join(" ")}
                </span>
              </div>
              <div className="row">
                <Link className="btn sm" href={`/admin/eval/${s.id}`}>
                  {ui.open}
                </Link>
                {user.role === "curator" && s.runs > 0 && (
                  <Link className="btn ghost sm" href={`/admin/eval/${s.id}/rate`}>
                    <Icon name="check" size={16} />
                    {ui.rate}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </section>

        {user.role === "curator" && (
          <aside>
            <form action={createSet} className="card stack">
              <h3>{ui.newSet}</h3>
              <label>
                {ui.name}
                <input id="set-name" name="name" type="text" required />
              </label>
              <label>
                {ui.description}
                <textarea id="set-desc" name="description" style={{ minHeight: 70 }} />
              </label>
              <fieldset>
                <legend>{ui.levels}</legend>
                <span className="hint xs">{ui.levelsHint}</span>
                {[1, 2, 3, 4].map((l) => (
                  <label key={l} className="check">
                    <input type="checkbox" name={`level${l}`} defaultChecked={l <= 2} /> L{l} · {t.levels[l as 1 | 2 | 3 | 4]}
                  </label>
                ))}
              </fieldset>
              <button className="btn" type="submit">
                {ui.create}
              </button>
            </form>
          </aside>
        )}
      </div>
    </main>
  );
}
