import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { pct } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { AccessBadge } from "@/components/AccessBadge";
import { resolveFlag } from "./actions";

type Q = { id: number; status: string; kind: string; ai_confidence: number | null; created_at: string; code: string; session_id: number; person: string | null; access_level: number | null; revoked_at: string | null; instrument: string | null; has_ai: number; transcript: string | null };

export default async function CuratePage({ searchParams }: { searchParams: Promise<{ done?: string; chunks?: string }> }) {
  await requireRole("curator");
  const { done, chunks } = await searchParams;
  const { t, locale } = await getT();
  const thDate = (d: string | null | undefined) => fmtDate(d, locale);
  const CONTENT_TYPES = t.contentTypes as Record<string, string>;
  const queue = all<Q>(`
    SELECT sg.id, sg.status, sg.kind, sg.ai_confidence, sg.created_at, sg.transcript, s.code, s.id AS session_id, p.display_name AS person,
           c.access_level, c.revoked_at, i.name_th AS instrument, sg.ai_suggestion IS NOT NULL AS has_ai
    FROM segments sg JOIN sessions s ON s.id = sg.session_id
    LEFT JOIN persons p ON p.id = s.person_id LEFT JOIN consents c ON c.id = s.consent_id LEFT JOIN instruments i ON i.id = sg.instrument_id
    WHERE sg.status IN ('pending', 'edited')
    ORDER BY sg.status = 'edited' DESC, sg.ai_confidence IS NULL DESC, sg.ai_confidence ASC, sg.created_at`);
  const flags = all<{ id: number; question: string; answer: string; created_at: string; name: string | null }>(
    "SELECT f.id, f.question, f.answer, f.created_at, u.name FROM tutor_flags f LEFT JOIN users u ON u.id = f.user_id WHERE f.status = 'open' ORDER BY f.created_at DESC",
  );
  const n = (sql: string) => one<{ n: number }>(sql)?.n ?? 0;
  const stats = [
    { v: queue.length, l: t.curate.stPending },
    { v: queue.filter((q) => q.ai_confidence != null && q.ai_confidence < 0.7).length, l: t.curate.stUnsure },
    { v: n("SELECT COUNT(*) AS n FROM segments WHERE status = 'approved'"), l: t.curate.stApproved },
    { v: flags.length, l: t.curate.stFlags },
  ];

  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{t.curate.eyebrow}</span>
        <h1>{t.curate.title}</h1>
        <p>{t.curate.lede}</p>
      </div>
      {done === "approved" && <div className="notice ok">{fmt(t.curate.approved, { n: chunks ?? 0 })}</div>}
      {done === "rejected" && <div className="notice">{t.curate.rejected}</div>}
      <div className="grid cols-4">
        {stats.map((s) => (
          <div key={s.l} className="card stat">
            <b>{s.v}</b>
            <span>{s.l}</span>
          </div>
        ))}
      </div>

      <section className="stack">
        <h2>{t.curate.queue}</h2>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>{t.curate.colSegment}</th>
                <th>{t.curate.colType}</th>
                <th>{t.curate.colPerson}</th>
                <th>{t.curate.colAccess}</th>
                <th className="num">{t.curate.colConf}</th>
                <th>{t.curate.colSent}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((q) => (
                <tr key={q.id}>
                  <td className="mono">
                    {q.code} · #{q.id}
                  </td>
                  <td>
                    {CONTENT_TYPES[q.kind] ?? q.kind}
                    {q.status === "edited" && <span className="badge ok">{t.draft.statusEdited}</span>}
                    {q.instrument && <span className="xs muted"> · {q.instrument}</span>}
                    {q.transcript && <div className="xs muted">{q.transcript.slice(0, 60)}…</div>}
                  </td>
                  <td>{q.person}</td>
                  <td>
                    <AccessBadge level={q.access_level} revoked={!!q.revoked_at} />
                  </td>
                  <td className="num">
                    {q.ai_confidence == null ? (
                      <span className="badge">{q.has_ai ? "-" : t.curate.noAi}</span>
                    ) : (
                      <span className={`badge ${q.ai_confidence < 0.7 ? "warn" : "ok"}`}>{pct(q.ai_confidence)}</span>
                    )}
                  </td>
                  <td className="xs">{thDate(q.created_at)}</td>
                  <td>
                    <Link className="btn sm" href={`/curate/${q.id}`}>
                      {t.curate.review}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {queue.length === 0 && <div className="empty">{t.curate.emptyQueue}</div>}
      </section>

      <section className="stack">
        <h2>{t.curate.flags}</h2>
        {flags.length === 0 && <div className="empty">{t.curate.noFlags}</div>}
        {flags.map((f) => (
          <div key={f.id} className="card">
            <div className="row between">
              <b>{f.question}</b>
              <span className="xs muted">
                {f.name ?? t.roles.public} · {thDate(f.created_at)}
              </span>
            </div>
            <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>
              {f.answer.slice(0, 500)}
            </p>
            <form action={resolveFlag.bind(null, f.id)}>
              <button className="btn ghost sm" type="submit">
                {t.curate.resolve}
              </button>
            </form>
          </div>
        ))}
      </section>
    </main>
  );
}
