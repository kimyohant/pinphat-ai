// ปรับฐานข้อมูลเดิมให้มีตารางและคอลัมน์ของหลังบ้าน (ADR-0001) โดยไม่ลบข้อมูลที่มีอยู่
import type { DatabaseSync } from "node:sqlite";

const VERSION = 3;

export const BACKOFFICE_SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, type TEXT NOT NULL, subject TEXT NOT NULL, title TEXT, role TEXT, assignee_id INTEGER, status TEXT DEFAULT 'open', due_on TEXT, note TEXT, created_by INTEGER, created_at TEXT, started_at TEXT, done_at TEXT);
CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(status, role);
CREATE INDEX IF NOT EXISTS idx_tasks_subject ON tasks(subject);
CREATE TABLE IF NOT EXISTS knowledge_gaps (id INTEGER PRIMARY KEY, question TEXT NOT NULL, norm TEXT UNIQUE, asked INTEGER DEFAULT 1, roles TEXT DEFAULT '[]', status TEXT DEFAULT 'open', session_id INTEGER, note TEXT, created_at TEXT, last_asked_at TEXT, closed_by INTEGER, closed_at TEXT);
CREATE TABLE IF NOT EXISTS consent_requests (id INTEGER PRIMARY KEY, consent_id INTEGER NOT NULL, channel TEXT, requester TEXT, relation TEXT, kind TEXT NOT NULL, new_level INTEGER, details TEXT, status TEXT DEFAULT 'received', received_by INTEGER, received_at TEXT, verified_by INTEGER, verified_at TEXT, verify_note TEXT, done_by INTEGER, done_at TEXT, outcome TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, secret INTEGER DEFAULT 0, updated_by INTEGER, updated_at TEXT);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL, session_id INTEGER, amount REAL NOT NULL, purpose TEXT, method TEXT, paid_on TEXT, receipt_ref TEXT, recorded_by INTEGER, created_at TEXT);
`;

function addColumn(d: DatabaseSync, table: string, col: string, type: string) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}

export function migrate(d: DatabaseSync): void {
  d.exec(BACKOFFICE_SCHEMA);
  const v = (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (v >= VERSION) return;
  if (v < 2) migrateV2(d);
  if (v < 3) migrateV3(d);
  d.exec(`PRAGMA user_version = ${VERSION}`);
}

/** v3: ปิดบัญชีได้โดยไม่ลบ (เก็บประวัติไว้ตรวจสอบ) และบัญชีผู้ดูแลระบบ */
function migrateV3(d: DatabaseSync): void {
  addColumn(d, "users", "active", "INTEGER DEFAULT 1");
  if (!d.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
    d.prepare("INSERT INTO users (name, role, school_id, class_name, title, active) VALUES (?, 'admin', NULL, NULL, ?, 1)").run("ผู้ดูแลระบบ", "ผู้ดูแลระบบตัวอย่าง");
  }
}

/** v2: ตารางหลังบ้าน (ADR-0001 ข้อ 1–4) */
function migrateV2(d: DatabaseSync): void {
  // ร่างจาก AI เก็บแยกไว้เทียบกับฉบับที่รับรอง เพื่อวัดอัตราที่คนต้องแก้
  addColumn(d, "segments", "ai_draft", "TEXT");
  addColumn(d, "segments", "edited_by", "INTEGER");
  addColumn(d, "segments", "edited_at", "TEXT");
  addColumn(d, "segments", "edit_rate", "REAL");

  const t = new Date().toISOString();
  if (!d.prepare("SELECT 1 FROM users WHERE role = 'assistant'").get()) {
    d.prepare("INSERT INTO users (name, role, school_id, class_name, title) VALUES (?, 'assistant', NULL, NULL, ?)").run("ผู้ช่วยวิจัย", "ผู้ช่วยวิจัยตัวอย่าง · แก้คำถอดความ");
  }

  // ร่าง AI ของส่วนย่อยที่ยังรอตรวจ
  for (const r of d.prepare("SELECT id, kind, ai_suggestion, transcript FROM segments WHERE status = 'pending' AND ai_draft IS NULL").all() as {
    id: number;
    kind: string;
    ai_suggestion: string | null;
    transcript: string | null;
  }[]) {
    let draft: string | null = null;
    try {
      const ai = r.ai_suggestion ? JSON.parse(r.ai_suggestion) : null;
      draft = ai?.notation ?? (ai?.asr?.status === "done" ? r.transcript : null);
    } catch {
      draft = null;
    }
    if (draft) d.prepare("UPDATE segments SET ai_draft = ? WHERE id = ?").run(draft, r.id);
  }

  // สร้างงานจากสิ่งที่ค้างอยู่แล้ว ครั้งแรกที่เปิดคิวงานกลาง
  const hasTasks = (d.prepare("SELECT COUNT(*) AS n FROM tasks").get() as { n: number }).n > 0;
  if (!hasTasks) {
    const ins = d.prepare("INSERT INTO tasks (type, subject, title, role, status, due_on, created_by, created_at) VALUES (?, ?, ?, ?, 'open', ?, 0, ?)");
    const due = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    for (const s of d.prepare(
      "SELECT sg.id, sg.kind, se.code, c.access_level FROM segments sg JOIN sessions se ON se.id = sg.session_id LEFT JOIN consents c ON c.id = se.consent_id WHERE sg.status = 'pending'",
    ).all() as { id: number; kind: string; code: string; access_level: number | null }[]) {
      if (s.kind === "interview") ins.run("review_transcript", `segment:${s.id}`, `${s.code} #${s.id}`, (s.access_level ?? 5) >= 4 ? "curator" : "assistant", due(7), t);
      else ins.run("review_notation", `segment:${s.id}`, `${s.code} #${s.id}`, "curator", due(10), t);
    }
    for (const f of d.prepare("SELECT id, question FROM tutor_flags WHERE status = 'open'").all() as { id: number; question: string }[]) {
      ins.run("tutor_flag", `flag:${f.id}`, f.question.slice(0, 120), "curator", due(3), t);
    }
  }
}
