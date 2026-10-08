import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDateTime } from "@/lib/i18n/config";
import { AdminTabs } from "@/components/AdminTabs";
import { DeskHead } from "@/components/desk/DeskHead";

type Row = { id: number; action: string; target: string; detail: string | null; at: string; name: string | null };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; user?: string }> }) {
  const me = await requireRole("admin");
  const { action = "", user = "" } = await searchParams;
  const { t, locale } = await getT();
  const prefixes = all<{ p: string }>("SELECT DISTINCT substr(action, 1, instr(action || '.', '.') - 1) AS p FROM audit_log ORDER BY p");
  const users = all<{ id: number; name: string }>("SELECT DISTINCT u.id, u.name FROM audit_log l JOIN users u ON u.id = l.user_id ORDER BY u.name");
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (action) {
    where.push("(l.action = ? OR l.action LIKE ?)");
    params.push(action, `${action}.%`);
  }
  if (user) {
    where.push("l.user_id = ?");
    params.push(Number(user));
  }
  const rows = all<Row>(
    `SELECT l.id, l.action, l.target, l.detail, l.at, u.name FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.id DESC LIMIT 200`,
    ...params,
  );

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.admin.eyebrow}
        title={t.admin.auditTitle}
        lede={t.admin.auditLede}
        stats={[
          { value: rows.length, label: t.admin.colAction },
          { value: users.length, label: t.admin.colUser },
        ]}
      />
      <AdminTabs t={t} active="audit" role={me.role} />
      <form className="row" method="get">
        <label className="row">
          {t.admin.filterAction}
          <select id="f-action" name="action" defaultValue={action} style={{ width: "auto" }}>
            <option value="">{t.admin.all}</option>
            {prefixes.map((p) => (
              <option key={p.p} value={p.p}>
                {p.p}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          {t.admin.filterUser}
          <select id="f-user" name="user" defaultValue={user} style={{ width: "auto" }}>
            <option value="">{t.admin.all}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn ghost sm" type="submit">
          {t.admin.filter}
        </button>
      </form>
      <p className="xs muted">{fmt(t.admin.showing, { n: rows.length })}</p>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>{t.admin.colTime}</th>
              <th>{t.admin.colUser}</th>
              <th>{t.admin.colAction}</th>
              <th>{t.admin.colTarget}</th>
              <th>{t.admin.colDetail}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="xs mono">{fmtDateTime(r.at, locale)}</td>
                <td className="small">{r.name ?? t.admin.system}</td>
                <td className="mono xs">{r.action}</td>
                <td className="mono xs">{r.target}</td>
                <td className="small">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
