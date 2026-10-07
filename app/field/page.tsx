import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { SESSION_SQL, type SessionRow } from "@/lib/field";
import { AccessBadge } from "@/components/AccessBadge";
import { thDate } from "@/lib/format";

const STATUS: Record<string, [string, string]> = {
  draft: ["ร่าง", "warn"],
  submitted: ["ส่งตรวจแล้ว", "ok"],
};

export default async function FieldPage() {
  const user = await requireRole("collector", "curator");
  const sessions = all<SessionRow & { assets: number; pending: number }>(
    `SELECT * FROM (${SESSION_SQL}) x
     LEFT JOIN (SELECT session_id, COUNT(*) AS assets FROM assets GROUP BY session_id) a ON a.session_id = x.id
     LEFT JOIN (SELECT session_id, COUNT(*) AS pending FROM segments WHERE status = 'pending' GROUP BY session_id) p ON p.session_id = x.id
     ${user.role === "collector" ? "WHERE x.collector_id = ?" : ""}
     ORDER BY x.created_at DESC`,
    ...(user.role === "collector" ? [user.id] : []),
  );
  return (
    <main className="page">
      <div className="row between">
        <div className="page-head">
          <div className="eyebrow">Field Studio</div>
          <h1>รอบบันทึกภาคสนาม</h1>
          <p>ทุกรอบต้องมีความยินยอมก่อนอัปโหลดไฟล์ ไฟล์ต้นฉบับถูกเก็บพร้อมค่า SHA-256 และส่งให้ AI วิเคราะห์เบื้องต้น</p>
        </div>
        <Link className="btn" href="/field/new">
          + เริ่มรอบบันทึกใหม่
        </Link>
      </div>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>รอบบันทึก</th>
              <th>ผู้ให้ข้อมูล</th>
              <th>พื้นที่</th>
              <th>ความยินยอม</th>
              <th className="num">ไฟล์</th>
              <th className="num">รอตรวจ</th>
              <th>สถานะ</th>
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
      {sessions.length === 0 && <div className="empty">ยังไม่มีรอบบันทึก เริ่มรอบแรกได้จากปุ่มด้านบน</div>}
    </main>
  );
}
