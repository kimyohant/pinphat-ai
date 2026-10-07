import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { CONTENT_TYPES } from "@/lib/access";
import { pct, thDate } from "@/lib/format";
import { AccessBadge } from "@/components/AccessBadge";
import { resolveFlag } from "./actions";

type Q = { id: number; kind: string; ai_confidence: number | null; created_at: string; code: string; session_id: number; person: string | null; access_level: number | null; revoked_at: string | null; instrument: string | null; has_ai: number; transcript: string | null };

export default async function CuratePage({ searchParams }: { searchParams: Promise<{ done?: string; chunks?: string }> }) {
  await requireRole("curator");
  const { done, chunks } = await searchParams;
  const queue = all<Q>(`
    SELECT sg.id, sg.kind, sg.ai_confidence, sg.created_at, sg.transcript, s.code, s.id AS session_id, p.display_name AS person,
           c.access_level, c.revoked_at, i.name_th AS instrument, sg.ai_suggestion IS NOT NULL AS has_ai
    FROM segments sg JOIN sessions s ON s.id = sg.session_id
    LEFT JOIN persons p ON p.id = s.person_id LEFT JOIN consents c ON c.id = s.consent_id LEFT JOIN instruments i ON i.id = sg.instrument_id
    WHERE sg.status = 'pending'
    ORDER BY sg.ai_confidence IS NULL DESC, sg.ai_confidence ASC, sg.created_at`);
  const flags = all<{ id: number; question: string; answer: string; created_at: string; name: string | null }>(
    "SELECT f.id, f.question, f.answer, f.created_at, u.name FROM tutor_flags f LEFT JOIN users u ON u.id = f.user_id WHERE f.status = 'open' ORDER BY f.created_at DESC",
  );
  const n = (sql: string) => one<{ n: number }>(sql)?.n ?? 0;
  const stats = [
    { v: queue.length, l: "รอตรวจ" },
    { v: queue.filter((q) => q.ai_confidence != null && q.ai_confidence < 0.7).length, l: "AI ไม่มั่นใจ (<70%)" },
    { v: n("SELECT COUNT(*) AS n FROM segments WHERE status = 'approved'"), l: "รับรองแล้ว" },
    { v: flags.length, l: "คำตอบ AI ที่ถูกแจ้ง" },
  ];

  return (
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">ตรวจรับรอง</div>
        <h1>AI เสนอ ผู้เชี่ยวชาญตัดสิน</h1>
        <p>รายการที่ AI ไม่มั่นใจหรือไม่มีผลวิเคราะห์ขึ้นก่อน ข้อมูลจะเข้าคลังความรู้ของครูผู้ช่วย AI หลังจากรับรองแล้วเท่านั้น</p>
      </div>
      {done === "approved" && <div className="notice ok">รับรองแล้ว และนำเข้าดัชนีความรู้ {chunks} ชิ้น</div>}
      {done === "rejected" && <div className="notice">บันทึกผลไม่ผ่านแล้ว</div>}
      <div className="grid cols-4">
        {stats.map((s) => (
          <div key={s.l} className="card stat">
            <b>{s.v}</b>
            <span>{s.l}</span>
          </div>
        ))}
      </div>

      <section className="stack">
        <h2>คิวตรวจ</h2>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>ส่วนย่อย</th>
                <th>ประเภท</th>
                <th>ผู้ให้ข้อมูล</th>
                <th>สิทธิ์</th>
                <th className="num">AI มั่นใจ</th>
                <th>ส่งเมื่อ</th>
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
                    {q.instrument && <span className="xs muted"> · {q.instrument}</span>}
                    {q.transcript && <div className="xs muted">{q.transcript.slice(0, 60)}…</div>}
                  </td>
                  <td>{q.person}</td>
                  <td>
                    <AccessBadge level={q.access_level} revoked={!!q.revoked_at} />
                  </td>
                  <td className="num">
                    {q.ai_confidence == null ? (
                      <span className="badge">{q.has_ai ? "-" : "ไม่มีผล AI"}</span>
                    ) : (
                      <span className={`badge ${q.ai_confidence < 0.7 ? "warn" : "ok"}`}>{pct(q.ai_confidence)}</span>
                    )}
                  </td>
                  <td className="xs">{thDate(q.created_at)}</td>
                  <td>
                    <Link className="btn sm" href={`/curate/${q.id}`}>
                      ตรวจ
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {queue.length === 0 && <div className="empty">ไม่มีรายการรอตรวจ</div>}
      </section>

      <section className="stack">
        <h2>คำตอบของครูผู้ช่วย AI ที่ผู้ใช้แจ้งว่าผิด</h2>
        {flags.length === 0 && <div className="empty">ยังไม่มีการแจ้ง</div>}
        {flags.map((f) => (
          <div key={f.id} className="card">
            <div className="row between">
              <b>{f.question}</b>
              <span className="xs muted">
                {f.name ?? "ผู้เยี่ยมชม"} · {thDate(f.created_at)}
              </span>
            </div>
            <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>
              {f.answer.slice(0, 500)}
            </p>
            <form action={resolveFlag.bind(null, f.id)}>
              <button className="btn ghost sm" type="submit">
                ตรวจแล้ว ปิดรายการ
              </button>
            </form>
          </div>
        ))}
      </section>
    </main>
  );
}
