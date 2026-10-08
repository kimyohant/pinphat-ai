import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { json } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import type { Role } from "@/lib/access";
import { updateGap } from "./actions";
import { DeskHead } from "@/components/desk/DeskHead";

type Gap = { id: number; question: string; asked: number; roles: string; status: string; note: string | null; last_asked_at: string; code: string | null };

export default async function GapsPage() {
  await requireRole("collector", "curator");
  const { t, locale } = await getT();
  const gaps = all<Gap>(`
    SELECT g.id, g.question, g.asked, g.roles, g.status, g.note, g.last_asked_at, s.code
    FROM knowledge_gaps g LEFT JOIN sessions s ON s.id = g.session_id
    ORDER BY g.status = 'open' DESC, g.status = 'planned' DESC, g.asked DESC, g.last_asked_at DESC`);
  const sessions = all<{ id: number; code: string; title: string }>("SELECT id, code, title FROM sessions ORDER BY created_at DESC LIMIT 50");
  const STATUS: Record<string, [string, string]> = {
    open: [t.gaps.stOpen, "warn"],
    planned: [t.gaps.stPlanned, "l2"],
    answered: [t.gaps.stAnswered, "ok"],
    dismissed: [t.gaps.stDismissed, ""],
  };

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.gaps.eyebrow}
        title={t.gaps.title}
        lede={t.gaps.lede}
        stats={[
          { value: gaps.filter((g) => g.status === "open").length, label: t.gaps.stOpen, alert: gaps.some((g) => g.status === "open") },
          { value: gaps.filter((g) => g.status === "planned").length, label: t.gaps.stPlanned },
          { value: gaps.reduce((a, g) => a + g.asked, 0), label: t.gaps.colAsked },
        ]}
      />
      {gaps.length === 0 ? (
        <div className="empty">{t.gaps.empty}</div>
      ) : (
        <div className="stack">
          {gaps.map((g) => (
            <article key={g.id} id={`gap-${g.id}`} className="card">
              <div className="row between">
                <b>{g.question}</b>
                <span className={`badge ${STATUS[g.status]?.[1] ?? ""}`}>{STATUS[g.status]?.[0] ?? g.status}</span>
              </div>
              <div className="row xs muted">
                <span>
                  {t.gaps.colAsked} {fmt(t.common.times, { n: g.asked })}
                </span>
                <span>
                  {t.gaps.colRoles}: {json<Role[]>(g.roles, []).map((r) => t.roles[r] ?? r).join(", ")}
                </span>
                <span>
                  {t.gaps.colLast} {fmtDate(g.last_asked_at, locale)}
                </span>
                {g.code && <span className="badge l2">{fmt(t.gaps.planned, { code: g.code })}</span>}
              </div>
              {g.note && <p className="small">{g.note}</p>}
              {(g.status === "open" || g.status === "planned") && (
                <form action={updateGap} className="row">
                  <input type="hidden" name="gapId" value={g.id} />
                  <select name="sessionId" defaultValue="" aria-label={t.gaps.plan} style={{ width: "auto" }}>
                    <option value="">{t.gaps.planPick}</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.title}
                      </option>
                    ))}
                  </select>
                  <input name="note" type="text" placeholder={t.gaps.notePh} aria-label={t.gaps.notePh} style={{ flex: 1, minWidth: 180 }} />
                  <button className="btn sm" type="submit" name="decision" value="plan">
                    {t.gaps.plan}
                  </button>
                  <button className="btn ghost sm" type="submit" name="decision" value="answered">
                    {t.gaps.answered}
                  </button>
                  <button className="btn ghost sm" type="submit" name="decision" value="dismissed">
                    {t.gaps.dismiss}
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
