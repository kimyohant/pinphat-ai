import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { LEVELS, PROVINCES, TK_LABELS } from "@/lib/access";
import { createSession } from "../actions";

const ERR: Record<string, string> = {
  missing: "กรอกชื่อรอบบันทึกและเลือกระดับการเข้าถึงก่อน",
  person: "เลือกผู้ให้ข้อมูลเดิม หรือกรอกชื่อผู้ให้ข้อมูลใหม่",
};

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("collector", "curator");
  const { error } = await searchParams;
  const persons = all<{ id: number; display_name: string; province: string }>("SELECT id, display_name, province FROM persons ORDER BY display_name");
  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <Link href="/field" className="small">
          ← รอบบันทึกทั้งหมด
        </Link>
        <h1>เริ่มรอบบันทึกใหม่</h1>
        <p>อธิบายวัตถุประสงค์และการใช้ข้อมูลให้ผู้ให้ข้อมูลฟังด้วยภาษาที่เข้าใจง่ายก่อนเริ่มบันทึก ระดับการเข้าถึงเปลี่ยนหรือถอนได้ภายหลัง</p>
      </div>
      {error && <div className="notice crit">{ERR[error] ?? "ข้อมูลไม่ครบ"}</div>}
      <form action={createSession} className="stack-lg">
        <fieldset>
          <legend>รอบบันทึก</legend>
          <label>
            ชื่อรอบบันทึก
            <input id="title" name="title" type="text" required placeholder="เช่น บันทึกระนาดเอกและสัมภาษณ์ประวัติการสืบทอด" />
          </label>
          <div className="grid cols-3">
            <label>
              จังหวัด
              <select id="province" name="province" defaultValue="สกลนคร">
                {PROVINCES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              อำเภอ
              <input id="district" name="district" type="text" />
            </label>
            <label>
              วันที่บันทึก
              <input id="recordedOn" name="recordedOn" type="date" />
            </label>
          </div>
          <label>
            สถานที่
            <input id="place" name="place" type="text" placeholder="เช่น บ้านครูภูมิปัญญา ศาลาวัด" />
          </label>
        </fieldset>

        <fieldset>
          <legend>ผู้ให้ข้อมูล</legend>
          <label>
            เลือกจากทะเบียน
            <select id="personId" name="personId" defaultValue="">
              <option value="">— ผู้ให้ข้อมูลใหม่ (กรอกด้านล่าง) —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} · {p.province}
                </option>
              ))}
            </select>
          </label>
          <div className="grid cols-2">
            <label>
              ชื่อผู้ให้ข้อมูลใหม่
              <input id="newPersonName" name="newPersonName" type="text" />
              <span className="hint">ใช้นามสมมติได้ ถ้าผู้ให้ข้อมูลไม่ประสงค์เปิดเผยชื่อ</span>
            </label>
            <label>
              บทบาท
              <select id="newPersonRole" name="newPersonRole" defaultValue="master">
                <option value="master">ครูภูมิปัญญา</option>
                <option value="artist">ศิลปิน / ผู้บรรเลง</option>
              </select>
            </label>
            <label>
              ปีเกิด (ค.ศ.)
              <input id="birthYear" name="birthYear" type="number" min={1900} max={2020} />
            </label>
            <label>
              เรียนมาจาก (ครู)
              <select id="teacherId" name="teacherId" defaultValue="">
                <option value="">— ไม่ระบุ —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="isPseudonym" defaultChecked /> ชื่อนี้เป็นนามสมมติ
          </label>
          <label>
            ประวัติโดยย่อ
            <textarea id="newPersonBio" name="newPersonBio" style={{ minHeight: 70 }} />
          </label>
        </fieldset>

        <fieldset>
          <legend>ความยินยอม</legend>
          <div className="radio-cards" role="radiogroup" aria-label="ระดับการเข้าถึง">
            {LEVELS.map((l) => (
              <label key={l.level}>
                <input type="radio" name="accessLevel" value={l.level} defaultChecked={l.level === 2} required />
                <b>
                  {l.short} · {l.name}
                </b>
                <span className="xs muted">{l.desc}</span>
              </label>
            ))}
          </div>
          <div className="stack">
            <span className="small">ป้ายเงื่อนไขทางวัฒนธรรม (Local Contexts TK Labels)</span>
            <div className="grid cols-2">
              {TK_LABELS.map((t) => (
                <label key={t.code} className="check">
                  <input type="checkbox" name={`tk:${t.code}`} defaultChecked={t.code === "TK A"} />
                  <span>
                    <b className="mono xs">{t.code}</b> {t.th}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid cols-2">
            <label>
              วิธีให้ความยินยอม
              <select id="method" name="method" defaultValue="voice">
                <option value="signature">ลงลายมือชื่อ</option>
                <option value="voice">บันทึกเสียงยินยอม</option>
                <option value="witness">มีพยานรับรอง</option>
              </select>
            </label>
            <label>
              หลักฐานความยินยอม
              <input id="evidence" name="evidence" type="file" accept="audio/*,image/*,application/pdf" />
              <span className="hint">ไฟล์เสียงหรือภาพใบยินยอม เก็บแยกและเห็นได้เฉพาะผู้ดูแล</span>
            </label>
          </div>
          <label>
            ขอบเขตการใช้ที่ตกลงกัน
            <textarea id="scopeNote" name="scopeNote" style={{ minHeight: 70 }} placeholder="เช่น ใช้ในสถานศึกษาได้ ไม่ใช้เชิงพาณิชย์ ขอให้ระบุชื่อครูทุกครั้ง" />
          </label>
        </fieldset>

        <label>
          บันทึกของผู้เก็บข้อมูล
          <textarea id="notes" name="notes" style={{ minHeight: 70 }} />
        </label>
        <div className="row">
          <button className="btn" type="submit">
            บันทึกความยินยอมและเริ่มรอบบันทึก
          </button>
          <Link className="btn ghost" href="/field">
            ยกเลิก
          </Link>
        </div>
      </form>
    </main>
  );
}
