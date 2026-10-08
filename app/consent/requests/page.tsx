import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate } from "@/lib/i18n/config";
import { LEVELS } from "@/lib/access";
import { AccessBadge } from "@/components/AccessBadge";
import { ConsentTabs } from "@/components/ConsentTabs";
import { createRequest, resolveRequest, verifyRequest } from "../actions";
import { DeskHead } from "@/components/desk/DeskHead";

type Req = {
  id: number;
  consent_id: number;
  person: string;
  access_level: number;
  revoked_at: string | null;
  channel: string;
  requester: string;
  relation: string;
  kind: string;
  new_level: number | null;
  details: string | null;
  status: string;
  received_by: number;
  received_at: string;
  verified_at: string | null;
  verify_note: string | null;
  done_at: string | null;
  outcome: string | null;
  receiver: string | null;
  verifier: string | null;
  doer: string | null;
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("collector", "curator", "community");
  const { error } = await searchParams;
  const { t, locale } = await getT();
  const d = (s: string | null) => fmtDate(s, locale);
  const consents = all<{ id: number; person: string; access_level: number }>(
    "SELECT c.id, p.display_name AS person, c.access_level FROM consents c JOIN persons p ON p.id = c.person_id WHERE c.revoked_at IS NULL ORDER BY p.display_name",
  );
  const reqs = all<Req>(`
    SELECT r.*, p.display_name AS person, c.access_level, c.revoked_at, u1.name AS receiver, u2.name AS verifier, u3.name AS doer
    FROM consent_requests r JOIN consents c ON c.id = r.consent_id JOIN persons p ON p.id = c.person_id
    LEFT JOIN users u1 ON u1.id = r.received_by LEFT JOIN users u2 ON u2.id = r.verified_by LEFT JOIN users u3 ON u3.id = r.done_by
    ORDER BY r.status IN ('received', 'verified') DESC, r.id DESC`);
  const CH: Record<string, string> = { phone: t.creq.chPhone, in_person: t.creq.chInPerson, line: t.creq.chLine, letter: t.creq.chLetter };
  const REL: Record<string, string> = { self: t.creq.relSelf, family: t.creq.relFamily, leader: t.creq.relLeader, other: t.creq.relOther };
  const KIND: Record<string, string> = { revoke: t.creq.kRevoke, level: t.creq.kLevel, correct: t.creq.kCorrect, other: t.creq.kOther };
  const STATUS: Record<string, [string, string]> = {
    received: [t.creq.stReceived, "warn"],
    verified: [t.creq.stVerified, "l2"],
    done: [t.creq.stDone, "ok"],
    rejected: [t.creq.stRejected, ""],
  };
  // ผลการดำเนินการเก็บแบบ "revoke:3" / "level:2:5" เพื่อแสดงเป็นภาษาของผู้อ่าน
  const outcomeText = (o: string | null) => {
    if (!o) return "";
    const [head, ...rest] = o.split(" · ");
    const p = head.split(":");
    const tail = rest.length ? ` · ${rest.join(" · ")}` : "";
    if (p[0] === "revoke") return fmt(t.creq.outcomeRevoke, { n: p[1] }) + tail;
    if (p[0] === "level") return fmt(t.creq.outcomeLevel, { level: p[1], n: p[2] }) + tail;
    return o;
  };

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.creq.eyebrow}
        title={t.creq.title}
        lede={t.creq.lede}
        stats={[
          { value: reqs.filter((r) => r.status === "received").length, label: t.creq.stReceived, alert: reqs.some((r) => r.status === "received") },
          { value: reqs.filter((r) => r.status === "verified").length, label: t.creq.stVerified },
          { value: reqs.filter((r) => r.status === "done").length, label: t.creq.stDone },
        ]}
      />
      <ConsentTabs t={t} active="requests" counts={{ requests: reqs.filter((r) => r.status === "received" || r.status === "verified").length }} />
      {error === "same" && <div className="notice crit">{t.creq.sameUser}</div>}

      <div className="split">
        <section className="stack">
          <h2>{t.creq.list}</h2>
          {reqs.length === 0 && <div className="empty">{t.creq.empty}</div>}
          {reqs.map((r) => (
            <article key={r.id} id={`creq-${r.id}`} className="card">
              <div className="row between">
                <span className="row">
                  <b>{KIND[r.kind] ?? r.kind}</b>
                  {r.kind === "level" && r.new_level && <AccessBadge level={r.new_level} />}
                  <span className="muted">· {r.person}</span>
                </span>
                <span className={`badge ${STATUS[r.status]?.[1] ?? ""}`}>{STATUS[r.status]?.[0] ?? r.status}</span>
              </div>
              <div className="small">
                {r.requester} · {REL[r.relation] ?? r.relation} · {CH[r.channel] ?? r.channel}
              </div>
              {r.details && <p className="small">{r.details}</p>}
              <div className="xs muted stack" style={{ gap: 2 }}>
                <span>{fmt(t.creq.receivedBy, { name: r.receiver ?? "-", date: d(r.received_at) })}</span>
                {r.verified_at && (
                  <span>
                    {fmt(t.creq.verifiedBy, { name: r.verifier ?? "-", date: d(r.verified_at) })}
                    {r.verify_note ? ` · ${r.verify_note}` : ""}
                  </span>
                )}
                {r.done_at && <span>{fmt(t.creq.doneBy, { name: r.doer ?? "-", date: d(r.done_at) })}</span>}
              </div>
              {r.outcome && <div className="notice small">{outcomeText(r.outcome)}</div>}

              {r.status === "received" && (
                <form action={verifyRequest} className="row">
                  <input type="hidden" name="requestId" value={r.id} />
                  <input name="verifyNote" type="text" placeholder={t.creq.verifyNote} aria-label={t.creq.verifyNote} style={{ flex: 1, minWidth: 200 }} />
                  <button className="btn sm" type="submit" disabled={r.received_by === user.id} title={r.received_by === user.id ? t.creq.sameUser : undefined}>
                    {t.creq.verify}
                  </button>
                </form>
              )}
              {r.status === "received" && r.received_by === user.id && <p className="xs muted">{t.creq.sameUser}</p>}
              {(r.status === "received" || r.status === "verified") && (
                <form action={resolveRequest} className="row">
                  <input type="hidden" name="requestId" value={r.id} />
                  <input name="outcome" type="text" placeholder={t.creq.outcomePh} aria-label={t.creq.outcomePh} style={{ flex: 1, minWidth: 200 }} />
                  {r.status === "verified" && (
                    <button className={`btn sm ${r.kind === "revoke" ? "danger" : ""}`} type="submit" name="decision" value="execute">
                      {t.creq.execute}
                    </button>
                  )}
                  <button className="btn ghost sm" type="submit" name="decision" value="reject">
                    {t.creq.reject}
                  </button>
                </form>
              )}
            </article>
          ))}
        </section>

        <aside>
          <form action={createRequest} className="card stack">
            <h3>{t.creq.newTitle}</h3>
            <label>
              {t.creq.consent}
              <select id="creq-consent" name="consentId" required>
                {consents.map((c) => (
                  <option key={c.id} value={c.id}>
                    C-{String(c.id).padStart(3, "0")} · {c.person} · L{c.access_level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.creq.kind}
              <select id="creq-kind" name="kind" defaultValue="revoke">
                {Object.entries(KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.creq.newLevel}
              <select id="creq-level" name="newLevel" defaultValue="">
                <option value="">—</option>
                {LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    L{l.level} · {t.levels[l.level]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.creq.requester}
              <input id="creq-requester" name="requester" type="text" required />
            </label>
            <div className="grid cols-2">
              <label>
                {t.creq.relation}
                <select id="creq-relation" name="relation" defaultValue="self">
                  {Object.entries(REL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.creq.channel}
                <select id="creq-channel" name="channel" defaultValue="phone">
                  {Object.entries(CH).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t.creq.details}
              <textarea id="creq-details" name="details" style={{ minHeight: 80 }} />
            </label>
            <button className="btn" type="submit">
              {t.creq.submit}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
