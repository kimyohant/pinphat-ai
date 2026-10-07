import Link from "next/link";
import { one } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { llmEnabled, modelLabel } from "@/lib/llm";

export default async function Home() {
  const user = await getUser();
  const n = (sql: string) => (one<{ n: number }>(sql)?.n ?? 0);
  const stats = [
    { v: (n("SELECT COALESCE(SUM(duration_s), 0) AS n FROM assets") / 60).toFixed(1), l: "นาทีเสียงในคลัง" },
    { v: n("SELECT COUNT(*) AS n FROM persons"), l: "ครูภูมิปัญญาและศิลปิน" },
    { v: n("SELECT COUNT(*) AS n FROM segments WHERE status = 'approved'"), l: "ส่วนย่อยที่รับรองแล้ว" },
    { v: n("SELECT COUNT(*) AS n FROM segments WHERE status = 'pending'"), l: "รอผู้เชี่ยวชาญตรวจ" },
    { v: n("SELECT COUNT(*) AS n FROM lessons"), l: "บทเรียน" },
    { v: n("SELECT COUNT(*) AS n FROM kb_chunks"), l: "ชิ้นความรู้ในดัชนี AI" },
  ];

  const roles = [
    { href: "/learn", t: "ฝึกเล่นกับโค้ช AI", d: "โน้ตเลื่อนตามเพลง ฟังเสียงตัวอย่างช้าลงได้ ฝึกด้วยระนาดบนจอหรือเครื่องจริงผ่านไมค์ แล้วรู้ทันทีว่าห้องไหนพลาด", who: "นักเรียน" },
    { href: "/tutor", t: "ถามครูผู้ช่วย AI", d: "ตอบจากคลังความรู้ของครูภูมิปัญญาเท่านั้น ทุกคำตอบมีเลขอ้างอิงกลับไปยังบทสัมภาษณ์และการบันทึก", who: "ทุกคน" },
    { href: "/teach", t: "ห้องเรียน", d: "เห็นว่านักเรียนคนไหนติดห้องไหน มอบหมายแบบฝึก สร้างบทเรียนจากการบรรเลงที่รับรองแล้ว", who: "ครูดนตรี" },
    { href: "/field", t: "Field Studio", d: "สร้างรอบบันทึก ขอความยินยอม อัปโหลดเสียง ระบบตรวจไฟล์ด้วย SHA-256 และให้ AI ถอดโน้ตและวัดระบบเสียง", who: "ผู้เก็บข้อมูล" },
    { href: "/curate", t: "ตรวจรับรอง", d: "AI เสนอ ผู้เชี่ยวชาญตัดสิน รายการที่ AI ไม่มั่นใจขึ้นก่อน แก้โน้ตรายห้องได้ก่อนเผยแพร่", who: "ผู้เชี่ยวชาญ" },
    { href: "/consent", t: "ความยินยอม", d: "เปลี่ยนระดับสิทธิ์หรือถอนข้อมูล แล้วข้อมูลจะหายจากครูผู้ช่วย AI ทันที", who: "ชุมชน" },
  ];

  return (
    <main className="page">
      <section className="stack-lg" style={{ paddingBlock: "18px 4px" }}>
        <div className="eyebrow">ต้นแบบแพลตฟอร์ม · ข้อมูลสาธิต</div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", color: "var(--indigo)" }}>Pinphat AI</h1>
        <p style={{ fontFamily: "var(--f-display)", fontSize: "1.15rem", maxWidth: "52ch" }}>
          แพลตฟอร์มปัญญาประดิษฐ์เพื่อการอนุรักษ์ ถ่ายทอด และส่งเสริมการเรียนรู้ดนตรีพิณพาทย์ล้านช้าง สำหรับสถานศึกษาในกลุ่มจังหวัดอีสานตอนเหนือ
        </p>
        <div className="row">
          {user.id ? (
            <span className="small muted">เข้าใช้ในชื่อ {user.name}</span>
          ) : (
            <Link className="btn" href="/login">
              เลือกบทบาทเพื่อทดลองใช้
            </Link>
          )}
          <Link className="btn ghost" href="/tutor">
            ลองถามครูผู้ช่วย AI
          </Link>
          <span className={`badge ${llmEnabled() ? "ok" : "warn"}`}>{llmEnabled() ? `เชื่อมต่อ AI แล้ว · ${modelLabel()}` : "โหมดค้นคืนจากคลัง (ยังไม่ได้ตั้งค่า LLM)"}</span>
        </div>
      </section>

      <section className="grid cols-3" aria-label="สถิติคลัง">
        {stats.map((s) => (
          <div key={s.l} className="card stat">
            <b>{s.v}</b>
            <span>{s.l}</span>
          </div>
        ))}
      </section>

      <section className="stack">
        <h2>เข้าใช้ตามบทบาท</h2>
        <div className="grid cols-3">
          {roles.map((r) => (
            <Link key={r.href} href={r.href} className="card">
              <span className="eyebrow">{r.who}</span>
              <h3>{r.t}</h3>
              <p className="small muted">{r.d}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="card hl">
        <h3>ความรู้อยู่ในคลัง ไม่ได้ฝังในโมเดล</h3>
        <p className="small">
          ครูผู้ช่วย AI ดึงเฉพาะความรู้ที่ผ่านการรับรองและอยู่ในระดับสิทธิ์ของผู้ถาม (Retrieval-Augmented Generation) เมื่อครูภูมิปัญญาถอนความยินยอม ข้อมูลจะถูกลบออกจากดัชนีทันที
          และทุกคำตอบอ้างอิงกลับไปยังการบันทึกต้นทางได้
        </p>
        <p className="xs muted">บุคคล เพลง ทาง และเสียงในเวอร์ชันนี้เป็นข้อมูลสมมติเพื่อการสาธิต เสียงทั้งหมดสังเคราะห์ขึ้นด้วยโปรแกรม</p>
      </section>
    </main>
  );
}
