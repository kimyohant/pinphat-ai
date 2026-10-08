import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { LEVELS, TK_LABELS } from "@/lib/access";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDate, fmtDateTime } from "@/lib/i18n/config";
import { json } from "@/lib/format";
import { AccessBadge } from "@/components/AccessBadge";
import { changeLevel, revokeConsent } from "./actions";
import { ConsentTabs } from "@/components/ConsentTabs";
import { DeskHead } from "@/components/desk/DeskHead";


export default async function ConsentPage() {
  await requireRole("collector", "curator", "community");
  const { t, locale } = await getT();
  const thDate = (d: string | null | undefined) => fmtDate(d, locale);
  const METHOD: Record<string, string> = { signature: t.consent.methodSignature, voice: t.consent.methodVoice, witness: t.consent.methodWitness };
  const consents = all<{
    id: number;
    person: string;
    access_level: number;
    tk_labels: string;
    method: string;
    scope_note: string | null;
    granted_at: string;
    revoked_at: string | null;
    sessions: number;
    chunks: number;
    recorder: string | null;
  }>(`
    SELECT c.*, p.display_name AS person, u.name AS recorder,
      (SELECT COUNT(*) FROM sessions s WHERE s.consent_id = c.id) AS sessions,
      (SELECT COUNT(*) FROM kb_chunks k WHERE k.consent_id = c.id) AS chunks
    FROM consents c JOIN persons p ON p.id = c.person_id LEFT JOIN users u ON u.id = c.recorded_by ORDER BY c.id`);
  const log = all<{ id: number; action: string; target: string; detail: string; at: string; name: string | null }>(
    "SELECT l.id, l.action, l.target, l.detail, l.at, u.name FROM audit_log l LEFT JOIN users u ON u.id = l.user_id WHERE l.action LIKE 'consent.%' OR l.action LIKE 'segment.%' OR l.action LIKE 'asset.%' OR l.action LIKE 'fixity.%' ORDER BY l.id DESC LIMIT 25",
  );

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.consent.eyebrow}
        title={t.consent.title}
        lede={t.consent.lede}
        stats={[
          { value: consents.filter((c) => !c.revoked_at).length, label: t.admin.oConsents },
          { value: consents.filter((c) => c.revoked_at).length, label: t.admin.oRevoked },
          { value: consents.reduce((a, c) => a + c.chunks, 0), label: t.consent.chunks },
        ]}
      />
      <ConsentTabs t={t} active="registry" />
      <div className="stack">
        {consents.map((c) => (
          <div key={c.id} className="card" style={c.revoked_at ? { opacity: 0.75 } : undefined}>
            <div className="row between">
              <div className="row">
                <span className="mono muted">C-{String(c.id).padStart(3, "0")}</span>
                <h3>{c.person}</h3>
                <AccessBadge level={c.access_level} revoked={!!c.revoked_at} />
              </div>
              <span className="xs muted">
                {METHOD[c.method] ?? c.method} · {thDate(c.granted_at)} · {fmt(t.consent.recordedBy, { name: c.recorder ?? "-" })}
              </span>
            </div>
            <p className="small">{c.scope_note}</p>
            <div className="row">
              {json<string[]>(c.tk_labels, []).map((l) => (
                <span key={l} className="badge">
                  {l} · {(t.tk as Record<string, string>)[l]}
                </span>
              ))}
            </div>
            <div className="row small muted">
              <span>{fmt(t.consent.sessions, { n: c.sessions })}</span>
              <span>
                <b style={{ color: "var(--ink)" }}>{c.chunks}</b> {t.consent.chunks}
              </span>
              {c.revoked_at && <span style={{ color: "var(--crit)" }}>{fmt(t.consent.revokedOn, { date: thDate(c.revoked_at) })}</span>}
            </div>
            {!c.revoked_at && (
              <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <form action={changeLevel} className="row">
                  <input type="hidden" name="consentId" value={c.id} />
                  <select name="level" defaultValue={c.access_level} aria-label={t.consent.levelLabel} style={{ width: "auto" }}>
                    {LEVELS.map((l) => (
                      <option key={l.level} value={l.level}>
                        {l.short} · {t.levels[l.level]}
                      </option>
                    ))}
                  </select>
                  <button className="btn ghost sm" type="submit">
                    {t.consent.changeLevel}
                  </button>
                </form>
                <form action={revokeConsent} className="row">
                  <input type="hidden" name="consentId" value={c.id} />
                  <label className="check small">
                    <input type="checkbox" name="confirm" value="yes" required /> {t.consent.confirm}
                  </label>
                  <button className="btn danger sm" type="submit">
                    {t.consent.revoke}
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="stack">
        <h2>{t.consent.log}</h2>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>{t.consent.colTime}</th>
                <th>{t.consent.colActor}</th>
                <th>{t.consent.colAction}</th>
                <th>{t.consent.colTarget}</th>
                <th>{t.consent.colDetail}</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td className="xs mono">{fmtDateTime(l.at, locale)}</td>
                  <td>{l.name ?? t.consent.system}</td>
                  <td className="mono xs">{l.action}</td>
                  <td className="mono xs">{l.target}</td>
                  <td className="small">{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
