import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { listJobs } from "@/lib/studio";
import { UNSLOTH, unslothEnabled } from "@/lib/unsloth";
import { StudioClient } from "@/components/StudioClient";

export default async function StudioPage() {
  await requireRole("teacher", "curator", "collector");
  const lessons = all<{ id: number; title: string }>("SELECT id, title FROM lessons ORDER BY id");
  return (
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">สตูดิโอสื่อการสอน</div>
        <h1>สร้างรูปและวิดีโอประกอบบทเรียน</h1>
        <p>ใช้โมเดลบนเซิร์ฟเวอร์ Unsloth ของโครงการ สื่อทุกชิ้นติดป้าย &quot;สร้างโดย AI&quot; และเก็บแยกจากคลังบันทึกของครูภูมิปัญญา</p>
        <div className="row xs muted">
          <span className="mono">รูป: {UNSLOTH.image}</span>
          <span className="mono">วิดีโอ: {UNSLOTH.video}</span>
          <span className="mono">ภาษา: {UNSLOTH.text}</span>
        </div>
      </div>
      <StudioClient lessons={lessons} initialJobs={listJobs()} enabled={unslothEnabled()} />
    </main>
  );
}
