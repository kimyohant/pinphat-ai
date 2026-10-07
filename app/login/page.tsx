import { all } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/access";
import { loginAs } from "./actions";

const ROLE_DESC: Record<string, string> = {
  student: "ฝึกเล่นกับโค้ช AI ถามครูผู้ช่วย AI เห็นข้อมูลระดับสาธารณะและสถานศึกษา",
  teacher: "ดูความก้าวหน้าของชั้นเรียน มอบหมายแบบฝึก สร้างบทเรียนจากคลัง",
  collector: "สร้างรอบบันทึกภาคสนาม ขอความยินยอม อัปโหลดเสียงให้ AI วิเคราะห์",
  curator: "ตรวจรับรองผลถอดโน้ตและถอดความจาก AI ก่อนเผยแพร่",
  community: "ดูแลความยินยอมของครูภูมิปัญญา เปลี่ยนระดับสิทธิ์หรือถอนข้อมูล",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  const users = all<{ id: number; name: string; role: Role; title: string | null }>(
    "SELECT id, name, role, title FROM users WHERE role != 'student' OR id = 1 ORDER BY CASE role WHEN 'student' THEN 1 WHEN 'teacher' THEN 2 WHEN 'collector' THEN 3 WHEN 'curator' THEN 4 ELSE 5 END",
  );
  return (
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">โหมดสาธิต</div>
        <h1>เลือกบัญชีทดลองตามบทบาท</h1>
        <p>เวอร์ชันต้นแบบใช้บัญชีทดลองแทนการตั้งรหัสผ่าน เมื่อใช้งานจริงจะเชื่อมกับระบบยืนยันตัวตนของสถานศึกษาหรือมหาวิทยาลัย</p>
      </div>
      {need && <div className="notice warn">หน้าที่คุณเปิดต้องใช้บทบาท: {need.split(",").map((r) => ROLE_LABEL[r as Role] ?? r).join(" หรือ ")}</div>}
      <div className="grid cols-3">
        {users.map((u) => (
          <form key={u.id} action={loginAs} className="card">
            <input type="hidden" name="userId" value={u.id} />
            <div className="row between">
              <span className="badge l2">{ROLE_LABEL[u.role]}</span>
            </div>
            <h3>{u.name}</h3>
            <p className="small muted">{u.title}</p>
            <p className="small">{ROLE_DESC[u.role]}</p>
            <button className="btn" type="submit">เข้าใช้ในบทบาทนี้</button>
          </form>
        ))}
      </div>
    </main>
  );
}
