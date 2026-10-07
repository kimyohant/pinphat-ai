// LLM Gateway: ส่งเฉพาะชิ้นความรู้ที่ผ่านการกรองสิทธิ์แล้วไปให้โมเดล
// ผู้ให้บริการ: Unsloth (โมเดลบนเซิร์ฟเวอร์ของโครงการ) หรือ Claude ถ้าไม่ได้ตั้งค่าเลย จะตอบแบบค้นคืนจากคลังอย่างเดียว
import Anthropic from "@anthropic-ai/sdk";
import type { Chunk } from "./kb";
import { bestSentences } from "./kb";
import { levelName } from "./access";
import { UNSLOTH, acquireGpu, ensureModel, gpuBusy, streamChat, unslothEnabled } from "./unsloth";

export const CLAUDE_MODEL = process.env.PINPHAT_MODEL || "claude-opus-5-5";

export type Provider = "unsloth" | "claude" | "none";

export function provider(): Provider {
  const want = process.env.PINPHAT_LLM_PROVIDER;
  const claudeOk = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (want === "claude" && claudeOk) return "claude";
  if (unslothEnabled()) return "unsloth";
  return claudeOk ? "claude" : "none";
}

export function llmEnabled(): boolean {
  return provider() !== "none";
}

export function modelLabel(): string {
  const p = provider();
  return p === "unsloth" ? UNSLOTH.text.replace(/^unsloth\//, "") : p === "claude" ? CLAUDE_MODEL : "ไม่มี";
}

const SYSTEM = `คุณคือ "ครูผู้ช่วย Pinphat" ผู้ช่วยสอนดนตรีพิณพาทย์ล้านช้างสำหรับนักเรียนและครูในโรงเรียนภาคตะวันออกเฉียงเหนือตอนบน

หลักการตอบ:
- ตอบจากเนื้อหาใน <sources> ที่แนบมากับคำถามเท่านั้น ความรู้นี้เป็นของครูภูมิปัญญาที่ให้ความยินยอมไว้ ห้ามเติมข้อเท็จจริงทางประวัติศาสตร์ ชื่อเพลง หรือวิธีบรรเลงจากความรู้ทั่วไปของคุณ
- ใส่เลขอ้างอิงแบบ [1] [2] ต่อท้ายประโยคที่ใช้ข้อมูลจากแหล่งนั้น และเอ่ยชื่อครูผู้ถ่ายทอดเมื่อเนื้อหามาจากบทสัมภาษณ์
- ถ้าแหล่งข้อมูลไม่พอจะตอบ ให้บอกตรง ๆ ว่ายังไม่มีข้อมูลนี้ในคลังที่ผู้ใช้เข้าถึงได้ และแนะนำให้ถามครูดนตรีหรือครูภูมิปัญญา
- ถ้าแหล่งข้อมูลระบุว่าเป็นเพลงพิธีกรรมหรือมีข้อจำกัดการใช้ ให้บอกข้อจำกัดนั้นด้วย
- ใช้ภาษาไทยที่เป็นกันเอง เหมาะกับนักเรียนมัธยม ตอบกระชับ ไม่เกิน 6 ประโยค ยกเว้นผู้ใช้ขอรายละเอียด
- เมื่อพูดถึงโน้ต ใช้โน้ตตัวเลขไทยตามที่ปรากฏในแหล่งข้อมูล`;

export function sourcesBlock(chunks: Chunk[]): string {
  return chunks
    .map((c, i) => `<source id="${i + 1}" title="${c.title}" citation="${c.citation}" access="${levelName(c.access_level)}">\n${c.text}\n</source>`)
    .join("\n");
}

export type Turn = { role: "user" | "assistant"; content: string };

/** GPU กำลังสร้างรูปหรือวิดีโออยู่ ครูผู้ช่วย AI จึงตอบแบบค้นคืนแทนการรอ */
export class GpuBusyError extends Error {}

function userTurn(question: string, chunks: Chunk[]): string {
  return `<sources>\n${sourcesBlock(chunks)}\n</sources>\n\nคำถาม: ${question}`;
}

/** สตรีมคำตอบทีละส่วน onStatus ใช้แจ้งสถานะ เช่น กำลังโหลดโมเดล */
export async function* streamAnswer(history: Turn[], question: string, chunks: Chunk[], onStatus?: (s: string) => void): AsyncGenerator<string> {
  if (provider() === "unsloth") {
    const busy = gpuBusy();
    if (busy && !busy.startsWith("tutor")) throw new GpuBusyError(busy);
    const release = await acquireGpu("tutor");
    try {
      const sw = ensureModel("text");
      const timer = setTimeout(() => onStatus?.("กำลังโหลดโมเดลภาษาขึ้น GPU (ครั้งแรกหลังสร้างรูปหรือวิดีโออาจใช้เวลาราว 1 นาที)"), 1500);
      await sw.finally(() => clearTimeout(timer));
      yield* streamChat([{ role: "system", content: SYSTEM }, ...history.slice(-6), { role: "user", content: userTurn(question, chunks) }], { maxTokens: 900 });
    } finally {
      release();
    }
    return;
  }

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [...history.slice(-6).map((t) => ({ role: t.role, content: t.content })), { role: "user", content: userTurn(question, chunks) }],
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") yield "\n\n(ระบบไม่สามารถตอบคำถามนี้ได้ กรุณาถามครูดนตรีโดยตรง)";
  if (final.stop_reason === "max_tokens") yield " …";
}

/** โหมดไม่มี LLM: สรุปจากประโยคที่ตรงที่สุดในแต่ละแหล่ง พร้อมเลขอ้างอิง */
export function extractiveAnswer(question: string, chunks: Chunk[]): string {
  const lines = chunks.slice(0, 3).map((c, i) => `• ${bestSentences(question, c.text)} [${i + 1}]`);
  return `จากคลังความรู้ที่คุณเข้าถึงได้ พบข้อมูลที่เกี่ยวข้องดังนี้\n\n${lines.join("\n")}`;
}
