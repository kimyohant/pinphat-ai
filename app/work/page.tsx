import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { pct } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { tasksFor, type Task } from "@/lib/tasks";
import type { Role } from "@/lib/access";
import { Icon } from "@/components/ui/Icon";
import { assignTask, claimTask, releaseTask } from "./actions";

/** ลิงก์จากงานไปยังหน้าที่ใช้ทำงานนั้น */
function hrefFor(t: Task): string {
  const [kind, id] = t.subject.split(":");
  if (kind === "segment") return `/curate/${id}`;
  if (kind === "flag") return "/curate";
  if (kind === "gap") return `/gaps#gap-${id}`;
  if (kind === "creq") return `/consent/requests#creq-${id}`;
  return "/work";
}

const LINKS: Record<string, { href: string; key: "gapsLink" | "requestsLink" | "paymentsLink" | "queueLink" }[]> = {
  curator: [
    { href: "/curate", key: "queueLink" },
    { href: "/gaps", key: "gapsLink" },
    { href: "/consent/requests", key: "requestsLink" },
    { href: "/consent/payments", key: "paymentsLink" },
  ],
  collector: [
    { href: "/gaps", key: "gapsLink" },
    { href: "/consent/requests", key: "requestsLink" },
  ],
  community: [
    { href: "/consent/requests", key: "requestsLink" },
    { href: "/consent/payments", key: "paymentsLink" },
  ],
  assistant: [],
};

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ all?: string; done?: string }> }) {
  const user = await requireRole("collector", "assistant", "curator", "community");
  const { all: showAll, done } = await searchParams;
  const { t, locale } = await getT();
  const tasks = tasksFor(user.id, user.role, showAll === "1");
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((x) => x.status === "open" || x.status === "in_progress");
  const overdue = open.filter((x) => x.due_on && x.due_on < today);
  const mine = open.filter((x) => x.assignee_id === user.id);
  const rate = one<{ avg: number | null; n: number }>("SELECT AVG(edit_rate) AS avg, COUNT(edit_rate) AS n FROM segments WHERE kind = 'interview' AND edit_rate IS NOT NULL");
  const team = user.role === "curator" ? all<{ id: number; name: string; role: Role }>("SELECT id, name, role FROM users WHERE role IN ('collector', 'assistant', 'curator', 'community') ORDER BY role, name") : [];
  const TYPES = t.taskTypes as Record<string, string>;
  const STATUS: Record<string, [string, string]> = {
    open: [t.work.stOpenBadge, ""],
    in_progress: [t.work.stProgress, "l2"],
    done: [t.work.stDone, "ok"],
    cancelled: [t.work.stCancelled, ""],
  };

  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{t.work.eyebrow}</span>
        <h1>{t.work.title}</h1>
        <p>{t.work.lede}</p>
      </div>
      {done === "sent" && <div className="notice ok">{t.draft.sent}</div>}

      <div className="grid cols-4">
        <div className="card stat">
          <b>{open.length}</b>
          <span>{t.work.stOpen}</span>
        </div>
        <div className="card stat">
          <b>{mine.length}</b>
          <span>{t.work.stMine}</span>
        </div>
        <div className="card stat">
          <b style={{ color: overdue.length ? "var(--crit)" : undefined }}>{overdue.length}</b>
          <span>{t.work.stOverdue}</span>
        </div>
        <div className="card stat">
          <b>{rate?.n ? pct(rate.avg) : "-"}</b>
          <span>{t.work.stEditRate}</span>
          {rate?.n ? <span className="xs muted">{fmt(t.work.stEditRateHint, { n: rate.n })}</span> : null}
        </div>
      </div>

      {LINKS[user.role]?.length > 0 && (
        <div className="row">
          {LINKS[user.role].map((l) => (
            <Link key={l.href} className="btn ghost sm" href={l.href}>
              {t.work[l.key]}
            </Link>
          ))}
        </div>
      )}

      <section className="stack">
        <div className="row between">
          <h2>{t.work.title}</h2>
          <Link className="small" href={showAll === "1" ? "/work" : "/work?all=1"}>
            {showAll === "1" ? t.work.hideDone : t.work.showDone}
          </Link>
        </div>
        {tasks.length === 0 ? (
          <div className="empty">{t.work.empty}</div>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>{t.work.colTask}</th>
                  <th>{t.work.colWho}</th>
                  <th>{t.work.colDue}</th>
                  <th>{t.work.colStatus}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((x) => {
                  const late = x.due_on && x.due_on < today && (x.status === "open" || x.status === "in_progress");
                  const active = x.status === "open" || x.status === "in_progress";
                  return (
                    <tr key={x.id}>
                      <td>
                        <Link href={hrefFor(x)}>
                          <b>{TYPES[x.type] ?? x.type}</b>
                        </Link>
                        <div className="xs muted">{x.title}</div>
                      </td>
                      <td>
                        {x.assignee ?? <span className="muted">{fmt(t.work.unassigned, { role: t.roles[x.role] ?? x.role })}</span>}
                        {user.role === "curator" && active && (
                          <form action={assignTask} className="row" style={{ marginTop: 4 }}>
                            <input type="hidden" name="taskId" value={x.id} />
                            <select name="assigneeId" defaultValue={x.assignee_id ?? ""} aria-label={t.work.assignTo} style={{ width: "auto" }}>
                              <option value="">—</option>
                              {team
                                .filter((m) => m.role === x.role || m.role === "curator")
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                            </select>
                            <button className="btn ghost sm" type="submit">
                              {t.work.assign}
                            </button>
                          </form>
                        )}
                      </td>
                      <td className="xs">
                        {fmtDate(x.due_on, locale)}
                        {late && (
                          <>
                            {" "}
                            <span className="badge crit">{t.work.overdue}</span>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${STATUS[x.status]?.[1] ?? ""}`}>{STATUS[x.status]?.[0] ?? x.status}</span>
                      </td>
                      <td>
                        <div className="row">
                          {active && x.assignee_id !== user.id && (x.role === user.role || user.role === "curator") && (
                            <form action={claimTask.bind(null, x.id)}>
                              <button className="btn sm" type="submit">
                                {t.work.claim}
                              </button>
                            </form>
                          )}
                          {active && x.assignee_id === user.id && (
                            <form action={releaseTask.bind(null, x.id)}>
                              <button className="btn ghost sm" type="submit">
                                {t.work.release}
                              </button>
                            </form>
                          )}
                          <Link className="btn ghost sm" href={hrefFor(x)}>
                            <Icon name="arrow" size={14} />
                            {t.work.open}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
