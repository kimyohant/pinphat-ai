import { getUser } from "@/lib/auth";
import { draftPrompt } from "@/lib/studio";
import { UnslothError } from "@/lib/unsloth";

export async function POST(req: Request) {
  const user = await getUser();
  if (!["teacher", "curator", "collector"].includes(user.role)) return Response.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  const b = (await req.json()) as { text?: string; kind?: string };
  const text = String(b.text ?? "").trim();
  if (!text) return Response.json({ error: "พิมพ์คำอธิบายภาษาไทยก่อน" }, { status: 400 });
  try {
    return Response.json({ prompt: await draftPrompt(text.slice(0, 1500), b.kind === "video" ? "video" : "image") });
  } catch (e) {
    const status = e instanceof UnslothError && e.status === 409 ? 409 : 502;
    return Response.json({ error: e instanceof Error ? e.message : "สร้าง prompt ไม่สำเร็จ" }, { status });
  }
}
