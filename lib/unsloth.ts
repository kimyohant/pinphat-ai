// ไคลเอนต์เซิร์ฟเวอร์ Unsloth Studio (API แบบ OpenAI-compatible) และตัวจัดการโมเดลบน GPU
// เซิร์ฟเวอร์ถือโมเดลได้ทีละตัว การโหลดโมเดลหนึ่งจะปลดโมเดลอื่นออก จึงสลับโมเดลตามงานผ่านคิวเดียว

export type ModelKind = "text" | "image" | "video";

export const UNSLOTH = {
  baseUrl: (process.env.UNSLOTH_BASE_URL ?? "").replace(/\/+$/, ""),
  apiKey: process.env.UNSLOTH_API_KEY ?? "",
  text: process.env.UNSLOTH_TEXT_MODEL || "unsloth/Qwen3.8-27B-GGUF",
  textVariant: process.env.UNSLOTH_TEXT_VARIANT || "UD-Q5_K_M",
  textContext: Number(process.env.UNSLOTH_TEXT_CONTEXT || 32768),
  image: process.env.UNSLOTH_IMAGE_MODEL || "Qwen/Qwen-Image-2.1",
  video: process.env.UNSLOTH_VIDEO_MODEL || "unsloth/Wan2.2-TI2V-5B-GGUF",
  videoFile: process.env.UNSLOTH_VIDEO_FILE || "Wan2.2-TI2V-5B-Q8_0.gguf",
};

export function unslothEnabled(): boolean {
  return Boolean(UNSLOTH.baseUrl && UNSLOTH.apiKey);
}

export class UnslothError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

export async function call(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  if (!unslothEnabled()) throw new UnslothError("ยังไม่ได้ตั้งค่า UNSLOTH_BASE_URL และ UNSLOTH_API_KEY");
  const { timeoutMs = 60_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(UNSLOTH.baseUrl + path, {
      ...rest,
      headers: { authorization: `Bearer ${UNSLOTH.apiKey}`, ...(rest.body && !(rest.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...rest.headers },
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new UnslothError(e instanceof Error && e.name === "TimeoutError" ? "เซิร์ฟเวอร์ AI ตอบช้าเกินกำหนด" : "เชื่อมต่อเซิร์ฟเวอร์ AI ไม่ได้");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { detail?: unknown; error?: { message?: string } };
      detail = typeof j.detail === "string" ? j.detail : (j.error?.message ?? JSON.stringify(j.detail ?? j).slice(0, 300));
    } catch {
      /* ไม่ใช่ JSON */
    }
    throw new UnslothError(`เซิร์ฟเวอร์ AI ตอบกลับ ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
  }
  return res;
}

async function json<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  return (await (await call(path, init)).json()) as T;
}

// ---------- ตัวจัดการโมเดล ----------

type Gpu = { chain: Promise<unknown>; current: ModelKind | null; busy: string | null; switching: ModelKind | null };
const g = globalThis as unknown as { __pinphatGpu?: Gpu };
const gpu: Gpu = (g.__pinphatGpu ??= { chain: Promise.resolve(), current: null, busy: null, switching: null });

/** จองคิว GPU คืนฟังก์ชันปล่อยคิว (ใช้กับงานสตรีมที่ต้องถือ GPU ไว้ตลอดการตอบ) */
export async function acquireGpu(label: string): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const prev = gpu.chain;
  gpu.chain = prev.then(() => mine);
  await prev;
  gpu.busy = label;
  return () => {
    gpu.busy = null;
    release();
  };
}

/** รันงานบน GPU ทีละงานตามลำดับ (งานที่ต้องสลับโมเดลจะไม่แย่ง GPU กัน) */
export async function withGpu<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireGpu(label);
  try {
    return await fn();
  } finally {
    release();
  }
}

export function gpuBusy(): string | null {
  return gpu.busy;
}

export async function loadedKind(): Promise<ModelKind | null> {
  const [t, i, v] = await Promise.all([
    json<{ active_model: string | null }>("/v1/status").catch(() => ({ active_model: null })),
    json<{ loaded: boolean; repo_id: string | null }>("/api/inference/images/status").catch(() => ({ loaded: false, repo_id: null })),
    json<{ loaded: boolean; repo_id: string | null }>("/api/inference/video/status").catch(() => ({ loaded: false, repo_id: null })),
  ]);
  if (t.active_model === UNSLOTH.text) return "text";
  if (i.loaded && i.repo_id === UNSLOTH.image) return "image";
  if (v.loaded && v.repo_id === UNSLOTH.video) return "video";
  return null;
}

async function waitLoaded(kind: "image" | "video", maxMs = 15 * 60_000): Promise<void> {
  const repo = kind === "image" ? UNSLOTH.image : UNSLOTH.video;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await json<{ loaded: boolean; repo_id: string | null }>(`/api/inference/${kind === "image" ? "images" : "video"}/status`);
    if (s.loaded && s.repo_id === repo) return;
    const p = await json<{ phase?: string; error?: string | null }>(`/api/inference/${kind === "image" ? "images" : "video"}/load-progress`).catch(() => ({ phase: "", error: null }));
    if (p.error) throw new UnslothError(`โหลดโมเดลไม่สำเร็จ: ${p.error}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new UnslothError("โหลดโมเดลนานเกินกำหนด");
}

/** งานสร้างรูปหรือวิดีโอที่กำลังรันอยู่บนเซิร์ฟเวอร์ (รวมงานที่สั่งจากหน้า Unsloth Studio โดยตรง) */
export async function remoteGeneration(): Promise<{ kind: "image" | "video"; etaSec: number | null } | null> {
  type P = { active: boolean; eta_seconds: number | null };
  const [v, i] = await Promise.all([
    json<P>("/api/inference/video/generate-progress").catch(() => ({ active: false, eta_seconds: null })),
    json<P>("/api/inference/images/generate-progress").catch(() => ({ active: false, eta_seconds: null })),
  ]);
  if (v.active) return { kind: "video", etaSec: v.eta_seconds };
  if (i.active) return { kind: "image", etaSec: i.eta_seconds };
  return null;
}

function busyMessage(b: { kind: "image" | "video"; etaSec: number | null }): string {
  const eta = b.etaSec ? ` (เหลืออีกราว ${Math.max(1, Math.round(b.etaSec / 60))} นาที)` : "";
  return `ตอนนี้ GPU กำลังสร้าง${b.kind === "video" ? "วิดีโอ" : "รูป"}อยู่${eta}`;
}

/** ให้แน่ใจว่าโมเดลประเภทนี้อยู่บน GPU (ต้องเรียกภายใน withGpu)
 *  ถ้าต้องสลับโมเดลแต่เซิร์ฟเวอร์กำลังสร้างรูป/วิดีโออยู่ จะไม่สลับ เพราะการโหลดโมเดลใหม่จะหยุดงานนั้นกลางคัน */
export async function ensureModel(kind: ModelKind, opts: { waitIfBusy?: boolean } = {}): Promise<{ switched: boolean; ms: number }> {
  const t0 = Date.now();
  if ((await loadedKind()) === kind) {
    gpu.current = kind;
    return { switched: false, ms: 0 };
  }
  for (;;) {
    const busy = await remoteGeneration();
    if (!busy) break;
    if (!opts.waitIfBusy) throw new UnslothError(busyMessage(busy), 409);
    if (Date.now() - t0 > 90 * 60_000) throw new UnslothError(busyMessage(busy) + " นานเกินกำหนด", 409);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  gpu.switching = kind;
  try {
    if (kind === "text") {
      await call("/v1/load", {
        method: "POST",
        timeoutMs: 15 * 60_000,
        body: JSON.stringify({ model_path: UNSLOTH.text, gguf_variant: UNSLOTH.textVariant, max_seq_length: UNSLOTH.textContext, n_parallel: 2 }),
      });
    } else if (kind === "image") {
      await call("/api/inference/images/load", { method: "POST", timeoutMs: 120_000, body: JSON.stringify({ model_path: UNSLOTH.image }) });
      await waitLoaded("image");
    } else {
      await call("/api/inference/video/load", {
        method: "POST",
        timeoutMs: 120_000,
        body: JSON.stringify({ model_path: UNSLOTH.video, gguf_filename: UNSLOTH.videoFile }),
      });
      await waitLoaded("video");
    }
    gpu.current = kind;
    return { switched: true, ms: Date.now() - t0 };
  } finally {
    gpu.switching = null;
  }
}

export function gpuState() {
  return { current: gpu.current, busy: gpu.busy, switching: gpu.switching };
}

// ---------- ข้อความ ----------

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** สตรีมคำตอบจาก /v1/chat/completions (SSE) */
export async function* streamChat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): AsyncGenerator<string> {
  const res = await call("/v1/chat/completions", {
    method: "POST",
    timeoutMs: 5 * 60_000,
    body: JSON.stringify({
      model: UNSLOTH.text,
      messages,
      stream: true,
      max_tokens: opts.maxTokens ?? 1200,
      temperature: opts.temperature ?? 0.4,
      enable_thinking: false,
    }),
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const data = s.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const t = j.choices?.[0]?.delta?.content;
        if (t) yield t;
      } catch {
        /* บรรทัดไม่สมบูรณ์ */
      }
    }
  }
}

export async function chat(messages: ChatMessage[], maxTokens = 600): Promise<string> {
  const j = await json<{ choices: { message: { content: string } }[] }>("/v1/chat/completions", {
    method: "POST",
    timeoutMs: 5 * 60_000,
    body: JSON.stringify({ model: UNSLOTH.text, messages, max_tokens: maxTokens, temperature: 0.4, enable_thinking: false }),
  });
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

// ---------- รูปภาพ ----------

export async function generateImage(prompt: string, size: string): Promise<Buffer> {
  const j = await json<{ data: { b64_json?: string }[] }>("/v1/images/generations", {
    method: "POST",
    timeoutMs: 15 * 60_000,
    body: JSON.stringify({ model: UNSLOTH.image, prompt, size, n: 1, response_format: "b64_json" }),
  });
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new UnslothError("เซิร์ฟเวอร์ไม่ได้ส่งรูปกลับมา");
  return Buffer.from(b64, "base64");
}

// ---------- วิดีโอ ----------

export type VideoJob = { id: string; status: string; progress: number; error: { message?: string } | null };

export async function createVideo(prompt: string, seconds: number, size: string): Promise<VideoJob> {
  return json<VideoJob>("/v1/videos", { method: "POST", body: JSON.stringify({ model: UNSLOTH.video, prompt, seconds: String(seconds), size }) });
}

export async function getVideo(id: string): Promise<VideoJob> {
  return json<VideoJob>(`/v1/videos/${encodeURIComponent(id)}`);
}

export async function videoContent(id: string): Promise<Buffer> {
  const res = await call(`/v1/videos/${encodeURIComponent(id)}/content`, { timeoutMs: 5 * 60_000 });
  return Buffer.from(await res.arrayBuffer());
}
