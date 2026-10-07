import { getUser } from "@/lib/auth";
import { ROLE_LABEL, ROLE_LEVELS, levelName } from "@/lib/access";
import { llmEnabled, modelLabel, provider } from "@/lib/llm";
import { TutorChat } from "@/components/TutorChat";

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await getUser();
  return (
    <main className="page">
      <div className="page-head">
        <div className="eyebrow">ครูผู้ช่วย AI</div>
        <h1>ถามเรื่องดนตรีพิณพาทย์ล้านช้าง</h1>
        <p>คำตอบมาจากคลังความรู้ของครูภูมิปัญญาที่ผ่านการรับรองแล้วเท่านั้น และอ้างอิงแหล่งที่มาทุกครั้ง</p>
        <div className="row xs">
          <span className="badge l2">
            คุณเห็นข้อมูลระดับ: {ROLE_LEVELS[user.role].map(levelName).join(", ")} ({ROLE_LABEL[user.role]})
          </span>
          <span className={`badge ${llmEnabled() ? "ok" : "warn"}`}>
            {llmEnabled() ? `โมเดล ${modelLabel()} · ${provider() === "unsloth" ? "เซิร์ฟเวอร์ Unsloth ของโครงการ" : "Claude"}` : "โหมดค้นคืนจากคลัง · ตั้งค่า UNSLOTH_API_KEY เพื่อเปิดใช้ LLM"}
          </span>
        </div>
      </div>
      <TutorChat initial={q} />
    </main>
  );
}
