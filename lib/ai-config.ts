// ค่าตั้งของ AI: อ่านจากตาราง settings ก่อน ถ้าผู้ดูแลยังไม่ได้ตั้งในหน้าเว็บ จึงใช้ค่าจาก .env.local แล้วค่อยใช้ค่าตั้งต้น
// คีย์ API เข้ารหัสด้วย AES-256-GCM ก่อนลงฐานข้อมูล ไฟล์ฐานข้อมูลหรือไฟล์สำรองที่หลุดออกไปจึงอ่านคีย์ไม่ได้
// คีย์จริงไม่เคยถูกส่งกลับไปที่เบราว์เซอร์ หน้าเว็บเห็นแค่ 4 ตัวท้าย
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { all, db, now, run } from "./db";
import { secret } from "./auth";

export type ProviderChoice = "auto" | "unsloth" | "claude" | "none";

type Field = { env: string[]; fallback: string; secret?: boolean };

export const AI_FIELDS = {
  provider: { env: ["PINPHAT_LLM_PROVIDER"], fallback: "auto" },
  unslothUrl: { env: ["UNSLOTH_BASE_URL"], fallback: "" },
  unslothKey: { env: ["UNSLOTH_API_KEY"], fallback: "", secret: true },
  textModel: { env: ["UNSLOTH_TEXT_MODEL"], fallback: "unsloth/Qwen3.8-27B-GGUF" },
  textVariant: { env: ["UNSLOTH_TEXT_VARIANT"], fallback: "UD-Q5_K_M" },
  textContext: { env: ["UNSLOTH_TEXT_CONTEXT"], fallback: "32768" },
  imageModel: { env: ["UNSLOTH_IMAGE_MODEL"], fallback: "Qwen/Qwen-Image-2.1" },
  videoModel: { env: ["UNSLOTH_VIDEO_MODEL"], fallback: "unsloth/Wan2.2-TI2V-5B-GGUF" },
  videoFile: { env: ["UNSLOTH_VIDEO_FILE"], fallback: "Wan2.2-TI2V-5B-Q8_0.gguf" },
  sttModel: { env: ["UNSLOTH_STT_MODEL"], fallback: "large-v3-turbo" },
  claudeKey: { env: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"], fallback: "", secret: true },
  claudeModel: { env: ["PINPHAT_MODEL"], fallback: "claude-opus-5-5" },
} satisfies Record<string, Field>;

export type AiKey = keyof typeof AI_FIELDS;
export type AiConfig = Record<AiKey, string>;
export type AiSource = "db" | "env" | "default";
/** สิ่งที่หน้าเว็บเห็นได้: ค่าปกติแสดงเต็ม ค่าลับแสดงแค่ 4 ตัวท้าย */
export type AiView = Record<AiKey, { value: string; source: AiSource; secret: boolean; set: boolean }> & { undecryptable: AiKey[] };

const PREFIX = "ai.";
const KEYS = Object.keys(AI_FIELDS) as AiKey[];

function cipherKey(): Buffer {
  // แยกคีย์เข้ารหัสออกจากคีย์ลงชื่อคุกกี้ ถึงจะมาจากความลับเดียวกัน
  return crypto.createHash("sha256").update(`pinphat-ai-config:${secret()}`).digest();
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${body.toString("base64")}`;
}

function decrypt(stored: string): string | null {
  try {
    const [v, iv, tag, body] = stored.split(":");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
  } catch {
    // คีย์ลับของเซิร์ฟเวอร์เปลี่ยน (เช่นลบ data/secret) ค่าที่เข้ารหัสไว้จึงอ่านไม่ได้ ถือว่ายังไม่ได้ตั้ง
    return null;
  }
}

type Resolved = { cfg: AiConfig; source: Record<AiKey, AiSource>; undecryptable: AiKey[] };
let cache: Resolved | null = null;

let ready = false;
function ensureTable() {
  // migrate() สร้างตารางนี้ตอนเปิดฐานข้อมูล แต่เซิร์ฟเวอร์ที่เปิดค้างไว้ก่อนอัปเดตจะยังไม่มี จึงสร้างเองครั้งแรกที่ใช้
  if (ready) return;
  db().exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, secret INTEGER DEFAULT 0, updated_by INTEGER, updated_at TEXT)");
  ready = true;
}

function resolve(): Resolved {
  if (cache) return cache;
  ensureTable();
  const rows = all<{ key: string; value: string; secret: number }>("SELECT key, value, secret FROM settings WHERE key LIKE 'ai.%'");
  const stored = new Map(rows.map((r) => [r.key.slice(PREFIX.length), r]));
  const cfg = {} as AiConfig;
  const source = {} as Record<AiKey, AiSource>;
  const undecryptable: AiKey[] = [];
  for (const k of KEYS) {
    const f: Field = AI_FIELDS[k];
    const row = stored.get(k);
    const fromDb = row ? (row.secret ? decrypt(row.value) : row.value) : null;
    if (row && fromDb == null) undecryptable.push(k);
    const fromEnv = f.env.map((e) => process.env[e]).find((v) => v != null && v !== "");
    if (fromDb != null && fromDb !== "") [cfg[k], source[k]] = [fromDb, "db"];
    else if (fromEnv) [cfg[k], source[k]] = [fromEnv, "env"];
    else [cfg[k], source[k]] = [f.fallback, "default"];
  }
  cfg.unslothUrl = cfg.unslothUrl.replace(/\/+$/, "");
  cache = { cfg, source, undecryptable };
  return cache;
}

/** ค่าตั้งปัจจุบัน ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น มีคีย์จริงอยู่ข้างใน ห้ามส่งค่านี้ลงไปที่ client component */
export function aiConfig(): AiConfig {
  return resolve().cfg;
}

export function aiView(): AiView {
  const { cfg, source, undecryptable } = resolve();
  const view = { undecryptable } as AiView;
  for (const k of KEYS) {
    const isSecret = Boolean((AI_FIELDS[k] as Field).secret);
    const v = cfg[k];
    view[k] = { value: isSecret ? (v ? `••••${v.slice(-4)}` : "") : v, source: source[k], secret: isSecret, set: Boolean(v) };
  }
  return view;
}

/**
 * บันทึกค่าจากหน้าเว็บ ช่องลับที่เว้นว่างหมายถึงคงค่าเดิม ช่องปกติที่เว้นว่างหมายถึงกลับไปใช้ .env.local หรือค่าตั้งต้น
 * คืนรายชื่อคีย์ที่เปลี่ยน เพื่อบันทึกลง audit log โดยไม่บันทึกตัวค่า
 */
export function saveAiConfig(input: Partial<Record<AiKey, string>>, clear: AiKey[], userId: number): AiKey[] {
  ensureTable();
  const changed: AiKey[] = [];
  for (const k of KEYS) {
    const f: Field = AI_FIELDS[k];
    if (clear.includes(k)) {
      if (run("DELETE FROM settings WHERE key = ?", PREFIX + k).changes) changed.push(k);
      continue;
    }
    if (!(k in input)) continue;
    const v = (input[k] ?? "").trim();
    if (f.secret) {
      if (!v) continue;
      run("INSERT INTO settings (key, value, secret, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, secret = 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at", PREFIX + k, encrypt(v), userId, now());
      changed.push(k);
      continue;
    }
    const cur = resolve();
    if (!v) {
      if (cur.source[k] === "db" && run("DELETE FROM settings WHERE key = ?", PREFIX + k).changes) changed.push(k);
      continue;
    }
    if (cur.source[k] === "db" && cur.cfg[k] === v) continue;
    // ค่าที่ตรงกับ .env.local หรือค่าตั้งต้นอยู่แล้วไม่ต้องเก็บซ้ำ จะได้เปลี่ยนจากไฟล์ได้ตามเดิม
    if (cur.source[k] !== "db" && cur.cfg[k] === v) continue;
    run("INSERT INTO settings (key, value, secret, updated_by, updated_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, secret = 0, updated_by = excluded.updated_by, updated_at = excluded.updated_at", PREFIX + k, v, userId, now());
    changed.push(k);
  }
  cache = null;
  return changed;
}

/** วันเวลาและผู้แก้ค่าตั้ง AI ล่าสุด แสดงในหน้าเว็บเป็นหลักฐาน */
export function aiLastChange(): { at: string; name: string | null } | null {
  ensureTable();
  return all<{ at: string; name: string | null }>("SELECT s.updated_at AS at, u.name FROM settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.key LIKE 'ai.%' ORDER BY s.updated_at DESC LIMIT 1")[0] ?? null;
}

/** คีย์จากหน้าผู้ดูแลมาก่อน ถ้าค่าที่ได้คือโทเคน ANTHROPIC_AUTH_TOKEN ใน .env ให้ SDK อ่านเองตามปกติ */
export function claudeClient(key = aiConfig().claudeKey): Anthropic {
  return key && key !== process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic({ apiKey: key }) : new Anthropic();
}
