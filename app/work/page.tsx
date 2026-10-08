import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { pct } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { tasksFor, type Task } from "@/lib/tasks";
import type { Role } from "@/lib/access";
import { Icon, type IconName } from "@/components/ui/Icon";
import { DeskHead, DeskLinks } from "@/components/desk/DeskHead";
import { assignTask, claimTask, releaseTask } from "./actions";

const TYPE_ICON: Record<string, IconName> = {
  review_transcript: "tutor",
  review_notation: "learn",
  expert_review: "curate",
  tutor_flag: "spark",
  knowledge_gap: "gap",
  consent_request: "consent",
};

/** ลิงก์จากงานไปยังหน้าที่ใช้ทำงานนั้น */
function hrefFor(t: Task): string {
  const [kind, id] = t.subject.split(":");
  if (kind === "segment") return `/curate/${id}`;
  if (kind === "flag") return "/curate";
  if (kind === "gap") return `/gaps#gap-${id}`;
  if (kind === "creq") return `/consent/requests#creq-${id}`;
  return "/work";
}

const count = (sql: string) => () => one<{ n: number }>(sql)?.n ?? 0;
const pendingReview = count("SELECT COUNT(*) AS n FROM segments WHERE status IN ('pending', 'edited')");
const openGaps = count("SELECT COUNT(*) AS n FROM knowledge_gaps WHERE status = 'open'");
const openRequests = count("SELECT COUNT(*) AS n FROM consent_requests WHERE status IN ('received', 'verified')");
type DeskKey = "gapsLink" | "requestsLink" | "paymentsLink" | "queueLink";
const LINKS: Record<string, { href: string; key: DeskKey; icon: IconName; count?: () => number }[]> = {
  curator: [
    { href: "/curate", key: "queueLink", icon: "curate", count: pendingReview },
    { href: "/gaps", key: "gapsLink", icon: "gap", count: openGaps },
    { href: "/consent/requests", key: "requestsLink", icon: "consent", count: openRequests },
    { href: "/consent/payments", key: "paymentsLink", icon: "shield" },
  ],
  collector: [
    { href: "/gaps", key: "gapsLink", icon: "gap", count: openGaps },
    { href: "/consent/requests", key: "requestsLink", icon: "consent", count: openRequests },
  ],
  community: [
    { href: "/consent/requests", key: "requestsLink", icon: "consent", count: openRequests },
    { href: "/consent/payments", key: "paymentsLink", icon: "shield" },
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
      <DeskHead
        eyebrow={t.work.eyebrow}
        title={t.work.title}
        lede={t.work.lede}
        stats={[
          { value: open.length, label: t.work.stOpen },
          { value: mine.length, label: t.work.stMine },
          { value: overdue.length, label: t.work.stOverdue, alert: overdue.length > 0 },
          { value: rate?.n ? pct(rate.avg) : "-", label: t.work.stEditRate },
        ]}
      />
      {done === "sent" && <div className="notice ok">{t.draft.sent}</div>}
      {LINKS[user.role]?.length > 0 && (
        <DeskLinks links={LINKS[user.role].map((l) => ({ href: l.href, label: t.work[l.key], icon: l.icon, count: l.count?.() }))} />
      )}

      <section className="stack">
        <nav className="seg links" aria-label={t.work.title}>
          <Link href="/work" aria-current={showAll === "1" ? undefined : "page"}>
            {t.work.stOpen} <span className="n">{open.length}</span>
          </Link>
          <Link href="/work?all=1" aria-current={showAll === "1" ? "page" : undefined}>
            {t.work.showDone}
          </Link>
        </nav>
        {tasks.length === 0 ? (
          <div className="empty">{t.work.empty}</div>
        ) : (
          <ul className="task-list">
            {tasks.map((x) => {
              const active = x.status === "open" || x.status === "in_progress";
              const late = active && !!x.due_on && x.due_on < today;
              return (
                <li key={x.id} className={`card task${late ? " late" : ""}${active ? "" : " closed"}`}>
                  <span className="ico">
                    <Icon name={TYPE_ICON[x.type] ?? "work"} size={20} />
                  </span>
                  <div className="task-main">
                    <Link href={hrefFor(x)}>
                      <b>{TYPES[x.type] ?? x.type}</b>
                    </Link>
                    <span className="small muted">{x.title}</span>
                    <div className="row xs">
                      <span className={`badge ${STATUS[x.status]?.[1] ?? ""}`}>{STATUS[x.status]?.[0] ?? x.status}</span>
                      <span className={`badge ${late ? "crit" : ""}`}>
                        {t.work.colDue} {fmtDate(x.due_on, locale)}
                      </span>
                      <span className="muted">{x.assignee ?? fmt(t.work.unassigned, { role: t.roles[x.role] ?? x.role })}</span>
                    </div>
                  </div>
                  <div className="task-actions">
                    {user.role === "curator" && active && (
                      <form action={assignTask} className="assign">
                        <input type="hidden" name="taskId" value={x.id} />
                        <select name="assigneeId" defaultValue={x.assignee_id ?? ""} aria-label={t.work.assignTo}>
                          <option value="">{t.work.assignTo}…</option>
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
                    <Link className="btn ghost sm" href={hrefFor(x)} aria-label={`${t.work.open} ${TYPES[x.type] ?? x.type}`}>
                      <Icon name="arrow" size={16} />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
