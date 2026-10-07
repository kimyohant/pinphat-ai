import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { LEVELS, TK_LABELS } from "@/lib/access";
import { json, thDate } from "@/lib/format";
import { AccessBadge } from "@/components/AccessBadge";
import { changeLevel, revokeConsent } from "./actions";

const METHOD: Record<string, string> = { signature: "ลายมือชื่อ", voice: "บันทึกเสียง", witness: "มีพยาน" };

export default async function ConsentPage() {
  await requireRole("collector", "curator", "community");
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
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">ธรรมาภิบาลข้อมูล</div>
        <h1>ทะเบียนความยินยอม</h1>
        <p>ครูภูมิปัญญาและชุมชนเปลี่ยนระดับการเข้าถึงหรือถอนความยินยอมได้ทุกเมื่อ เมื่อถอนแล้ว ความรู้ชุดนั้นจะถูกลบออกจากดัชนีของครูผู้ช่วย AI ทันที และไฟล์จะเปิดฟังไม่ได้</p>
      </div>
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
                {METHOD[c.method] ?? c.method} · {thDate(c.granted_at)} · บันทึกโดย {c.recorder}
              </span>
            </div>
            <p className="small">{c.scope_note}</p>
            <div className="row">
              {json<string[]>(c.tk_labels, []).map((l) => (
                <span key={l} className="badge">
                  {l} · {TK_LABELS.find((t) => t.code === l)?.th}
                </span>
              ))}
            </div>
            <div className="row small muted">
              <span>{c.sessions} รอบบันทึก</span>
              <span>
                <b style={{ color: "var(--ink)" }}>{c.chunks}</b> ชิ้นความรู้ในดัชนี AI
              </span>
              {c.revoked_at && <span style={{ color: "var(--crit)" }}>ถอนเมื่อ {thDate(c.revoked_at)}</span>}
            </div>
            {!c.revoked_at && (
              <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <form action={changeLevel} className="row">
                  <input type="hidden" name="consentId" value={c.id} />
                  <select name="level" defaultValue={c.access_level} aria-label="ระดับการเข้าถึง" style={{ width: "auto" }}>
                    {LEVELS.map((l) => (
                      <option key={l.level} value={l.level}>
                        {l.short} · {l.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn ghost sm" type="submit">
                    เปลี่ยนระดับ
                  </button>
                </form>
                <form action={revokeConsent} className="row">
                  <input type="hidden" name="consentId" value={c.id} />
                  <label className="check small">
                    <input type="checkbox" name="confirm" value="yes" required /> ยืนยันตามคำขอของผู้ให้ข้อมูล
                  </label>
                  <button className="btn danger sm" type="submit">
                    ถอนความยินยอม
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="stack">
        <h2>บันทึกการเข้าถึงและการเปลี่ยนแปลง</h2>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ผู้ดำเนินการ</th>
                <th>การกระทำ</th>
                <th>เป้าหมาย</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td className="xs mono">{new Date(l.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{l.name ?? "ระบบ"}</td>
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
