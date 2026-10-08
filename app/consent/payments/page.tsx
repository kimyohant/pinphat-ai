import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { INTL_LOCALE, fmt, fmtDate } from "@/lib/i18n/config";
import { ConsentTabs } from "@/components/ConsentTabs";
import { addPayment } from "../actions";
import { DeskHead } from "@/components/desk/DeskHead";

type Pay = { id: number; person: string; code: string | null; amount: number; purpose: string | null; method: string; paid_on: string; receipt_ref: string | null; recorder: string | null };

export default async function PaymentsPage() {
  await requireRole("collector", "curator", "community");
  const { t, locale } = await getT();
  const money = (n: number) => fmt(t.pay.baht, { n: n.toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: 2 }) });
  const persons = all<{ id: number; display_name: string }>("SELECT id, display_name FROM persons ORDER BY display_name");
  const sessions = all<{ id: number; code: string; title: string }>("SELECT id, code, title FROM sessions ORDER BY created_at DESC");
  const pays = all<Pay>(`
    SELECT y.id, p.display_name AS person, s.code, y.amount, y.purpose, y.method, y.paid_on, y.receipt_ref, u.name AS recorder
    FROM payments y JOIN persons p ON p.id = y.person_id LEFT JOIN sessions s ON s.id = y.session_id LEFT JOIN users u ON u.id = y.recorded_by
    ORDER BY y.paid_on DESC, y.id DESC`);
  const totals = all<{ person: string; total: number; n: number }>(
    "SELECT p.display_name AS person, SUM(y.amount) AS total, COUNT(*) AS n FROM payments y JOIN persons p ON p.id = y.person_id GROUP BY y.person_id ORDER BY total DESC",
  );
  const grand = totals.reduce((a, x) => a + x.total, 0);
  const METHOD: Record<string, string> = { cash: t.pay.mCash, transfer: t.pay.mTransfer, other: t.pay.mOther };

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.creq.eyebrow}
        title={t.pay.title}
        lede={t.pay.lede}
        stats={[
          { value: money(grand), label: t.pay.total },
          { value: pays.length, label: t.pay.list },
          { value: totals.length, label: t.pay.person },
        ]}
      />
      <ConsentTabs t={t} active="payments" />

      <div className="split">
        <div className="stack-lg">
          <section className="stack">
            <h2>{t.pay.list}</h2>
            {pays.length === 0 ? (
              <div className="empty">{t.pay.empty}</div>
            ) : (
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>{t.pay.paidOn}</th>
                      <th>{t.pay.person}</th>
                      <th>{t.pay.purpose}</th>
                      <th>{t.pay.method}</th>
                      <th className="num">{t.pay.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pays.map((y) => (
                      <tr key={y.id}>
                        <td className="xs">{fmtDate(y.paid_on, locale)}</td>
                        <td>
                          {y.person}
                          {y.code && <div className="xs muted mono">{y.code}</div>}
                        </td>
                        <td className="small">
                          {y.purpose}
                          {y.receipt_ref && <div className="xs muted mono">{y.receipt_ref}</div>}
                        </td>
                        <td className="small">{METHOD[y.method] ?? y.method}</td>
                        <td className="num">{money(y.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {totals.length > 0 && (
            <section className="card">
              <h3>{t.pay.byPerson}</h3>
              {totals.map((x) => (
                <div key={x.person} className="row between small">
                  <span>
                    {x.person} <span className="muted">· {fmt(t.common.times, { n: x.n })}</span>
                  </span>
                  <b className="mono">{money(x.total)}</b>
                </div>
              ))}
              <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <b>{t.pay.total}</b>
                <b className="mono">{money(grand)}</b>
              </div>
            </section>
          )}
        </div>

        <aside>
          <form action={addPayment} className="card stack">
            <h3>{t.pay.submit}</h3>
            <label>
              {t.pay.person}
              <select id="pay-person" name="personId" required>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.pay.session}
              <select id="pay-session" name="sessionId" defaultValue="">
                <option value="">{t.pay.noSession}</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid cols-2">
              <label>
                {t.pay.amount}
                <input id="pay-amount" name="amount" type="number" min={1} step="0.01" required />
              </label>
              <label>
                {t.pay.paidOn}
                <input id="pay-date" name="paidOn" type="date" />
              </label>
            </div>
            <label>
              {t.pay.purpose}
              <input id="pay-purpose" name="purpose" type="text" placeholder={t.pay.purposePh} />
            </label>
            <div className="grid cols-2">
              <label>
                {t.pay.method}
                <select id="pay-method" name="method" defaultValue="transfer">
                  {Object.entries(METHOD).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.pay.receipt}
                <input id="pay-receipt" name="receipt" type="text" />
              </label>
            </div>
            <button className="btn" type="submit">
              {t.pay.submit}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
