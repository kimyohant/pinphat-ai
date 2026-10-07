import Anthropic from "@anthropic-ai/sdk";
import { getUser, levelsFor } from "@/lib/auth";
import { audit } from "@/lib/db";
import { retrieve } from "@/lib/kb";
import { GpuBusyError, extractiveAnswer, llmEnabled, provider, streamAnswer, type Turn } from "@/lib/llm";
import { UnslothError } from "@/lib/unsloth";
import { levelName } from "@/lib/access";

// ส่งกลับเป็น NDJSON: {type:"sources"} → {type:"text"}* → {type:"done"}
export async function POST(req: Request) {
  const user = await getUser();
  const { messages } = (await req.json()) as { messages: Turn[] };
  const question = messages.at(-1)?.content?.trim() ?? "";
  if (!question) return Response.json({ error: "ไม่มีคำถาม" }, { status: 400 });
  const history = messages.slice(0, -1).filter((m) => m.role === "user" || m.role === "assistant");
  const prevQ = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  // กรองสิทธิ์ก่อนค้นคืน: ชิ้นความรู้ที่ผู้ถามไม่มีสิทธิ์จะไม่ถูกส่งไปถึงโมเดลเลย
  let chunks = retrieve(question, levelsFor(user));
  if (!chunks.length && prevQ) chunks = retrieve(`${prevQ} ${question}`, levelsFor(user));
  audit(user.id, "tutor.ask", "tutor", question.slice(0, 200));

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      send({
        type: "sources",
        sources: chunks.map((c, i) => ({
          n: i + 1,
          title: c.title,
          citation: c.citation,
          level: c.access_level,
          levelName: levelName(c.access_level),
          sourceType: c.source_type,
          sourceId: c.source_id,
        })),
      });
      if (!chunks.length) {
        send({
          type: "text",
          text: "ยังไม่มีข้อมูลเรื่องนี้ในคลังความรู้ที่คุณเข้าถึงได้ ลองถามครูดนตรีหรือครูภูมิปัญญาในชุมชน คำถามนี้จะถูกเก็บไว้ให้ทีมภาคสนามพิจารณาบันทึกเพิ่ม",
        });
        send({ type: "done", mode: "none" });
        controller.close();
        return;
      }
      if (!llmEnabled()) {
        send({ type: "text", text: extractiveAnswer(question, chunks) });
        send({ type: "done", mode: "retrieval" });
        controller.close();
        return;
      }
      try {
        let started = false;
        for await (const t of streamAnswer(history, question, chunks, (status) => send({ type: "status", text: status }))) {
          started = true;
          send({ type: "text", text: t });
        }
        if (!started) send({ type: "text", text: extractiveAnswer(question, chunks) });
        send({ type: "done", mode: started ? "llm" : "retrieval", provider: provider() });
      } catch (e) {
        const msg =
          e instanceof GpuBusyError
            ? "ตอนนี้เซิร์ฟเวอร์ AI กำลังสร้างรูปหรือวิดีโอให้ครูอยู่"
            : e instanceof UnslothError
              ? e.message
              : e instanceof Anthropic.AuthenticationError
                ? "คีย์ API ไม่ถูกต้อง"
                : e instanceof Anthropic.RateLimitError
                  ? "มีผู้ใช้จำนวนมาก ลองใหม่อีกครั้งในอีกสักครู่"
                  : e instanceof Anthropic.APIError
                    ? `บริการ AI ขัดข้อง (${e.status})`
                    : "เชื่อมต่อบริการ AI ไม่ได้";
        send({ type: "text", text: `${msg} จึงแสดงข้อมูลจากคลังแทน\n\n${extractiveAnswer(question, chunks)}` });
        send({ type: "done", mode: "retrieval" });
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
