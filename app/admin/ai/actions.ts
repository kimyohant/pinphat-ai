"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/db";
import { AI_FIELDS, aiConfig, claudeClient, saveAiConfig, type AiKey } from "@/lib/ai-config";
import { UnslothError, call, loadedKind, unslothEnabled } from "@/lib/unsloth";

const PROVIDERS = ["auto", "unsloth", "claude", "none"];

export async function saveAi(formData: FormData) {
  const user = await requireRole("admin");
  const input: Partial<Record<AiKey, string>> = {};
  for (const k of Object.keys(AI_FIELDS) as AiKey[]) {
    const v = formData.get(k);
    if (v != null) input[k] = String(v);
  }
  if (input.provider && !PROVIDERS.includes(input.provider)) delete input.provider;
  if (input.unslothUrl && !/^https?:\/\//i.test(input.unslothUrl.trim())) input.unslothUrl = `http://${input.unslothUrl.trim()}`;
  const clear = formData.getAll("clear").map(String).filter((k): k is AiKey => k in AI_FIELDS);
  const changed = saveAiConfig(input, clear, user.id);
  // บันทึกว่าเปลี่ยนค่าไหน แต่ไม่บันทึกตัวค่า: audit log เปิดให้ผู้ดูแลอ่านได้ และห้ามมีคีย์อยู่ในนั้น
  if (changed.length) audit(user.id, "admin.ai.update", "settings:ai", changed.join(", "));
  redirect(`/admin/ai?saved=${changed.length}`);
}

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new UnslothError("timeout")), ms))]);
}

/** ทดสอบด้วยค่าที่บันทึกแล้วจริง ๆ เพื่อให้ผลตรงกับที่ครู AI จะใช้ */
export async function testAi(target: "unsloth" | "claude") {
  const user = await requireRole("admin");
  const t0 = Date.now();
  let q: Record<string, string>;
  try {
    if (target === "unsloth") {
      if (!unslothEnabled()) throw new UnslothError("notset");
      await within(call("/v1/status", { timeoutMs: 8000 }), 9000);
      const loaded = await within(loadedKind(), 6000).catch(() => null);
      q = { ok: "1", ms: String(Date.now() - t0), loaded: loaded ?? "" };
    } else {
      if (!aiConfig().claudeKey) throw new UnslothError("notset");
      await within(claudeClient().models.list({ limit: 1 }), 12000);
      q = { ok: "1", ms: String(Date.now() - t0) };
    }
  } catch (e) {
    const status = e instanceof UnslothError ? e.status : ((e as { status?: number })?.status ?? 0);
    const msg = e instanceof Error ? e.message : String(e);
    q = msg === "notset" ? { err: "notset" } : status === 401 || status === 403 ? { err: "auth", code: String(status) } : { err: "reach", msg: msg.slice(0, 160) };
  }
  audit(user.id, "admin.ai.test", `ai:${target}`, q.ok ? "ok" : q.err);
  redirect(`/admin/ai?${new URLSearchParams({ test: target, ...q })}`);
}
