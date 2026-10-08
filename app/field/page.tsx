import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { SESSION_SQL, type SessionRow } from "@/lib/field";
import { AccessBadge } from "@/components/AccessBadge";
import { getT } from "@/lib/i18n/server";
import { fmtDate } from "@/lib/i18n/config";
import { Icon } from "@/components/ui/Icon";
import { DeskHead } from "@/components/desk/DeskHead";


export default async function FieldPage() {
  const user = await requireRole("collector", "curator");
  const { t, locale } = await getT();
  const thDate = (d: string | null | undefined) => fmtDate(d, locale);
  const STATUS: Record<string, [string, string]> = { draft: [t.field.draft, "warn"], submitted: [t.field.submitted, "ok"] };
  const sessions = all<SessionRow & { assets: number; pending: number }>(
    `SELECT * FROM (${SESSION_SQL}) x
     LEFT JOIN (SELECT session_id, COUNT(*) AS assets FROM assets GROUP BY session_id) a ON a.session_id = x.id
     LEFT JOIN (SELECT session_id, COUNT(*) AS pending FROM segments WHERE status = 'pending' GROUP BY session_id) p ON p.session_id = x.id
     ${user.role === "collector" ? "WHERE x.collector_id = ?" : ""}
     ORDER BY x.created_at DESC`,
    ...(user.role === "collector" ? [user.id] : []),
  );
  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.field.eyebrow}
        title={t.field.title}
        lede={t.field.lede}
        stats={[
          { value: sessions.length, label: t.field.colSession },
          { value: sessions.reduce((a, s) => a + (s.assets ?? 0), 0), label: t.field.colFiles },
          { value: sessions.reduce((a, s) => a + (s.pending ?? 0), 0), label: t.field.colPending },
        ]}
      >
        <Link className="btn gold" href="/field/new">
          <Icon name="field" size={18} />
          {t.field.newSession}
        </Link>
      </DeskHead>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>{t.field.colCode}</th>
              <th>{t.field.colSession}</th>
              <th>{t.field.colPerson}</th>
              <th>{t.field.colPlace}</th>
              <th>{t.field.colConsent}</th>
              <th className="num">{t.field.colFiles}</th>
              <th className="num">{t.field.colPending}</th>
              <th>{t.field.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.code}</td>
                <td>
                  <Link href={`/field/${s.id}`}>{s.title}</Link>
                  <div className="xs muted">{thDate(s.recorded_on)}</div>
                </td>
                <td>{s.person}</td>
                <td>
                  {s.district} · {s.province}
                </td>
                <td>
                  <AccessBadge level={s.access_level} revoked={!!s.revoked_at} />
                </td>
                <td className="num">{s.assets ?? 0}</td>
                <td className="num">{s.pending ?? 0}</td>
                <td>
                  <span className={`badge ${STATUS[s.status]?.[1] ?? ""}`}>{STATUS[s.status]?.[0] ?? s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sessions.length === 0 && <div className="empty">{t.field.empty}</div>}
    </main>
  );
}
