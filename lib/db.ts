// ฐานข้อมูล SQLite ในตัว Node (node:sqlite) สร้างตารางและใส่ข้อมูลตัวอย่างอัตโนมัติเมื่อเปิดครั้งแรก
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync as DB, SQLInputValue } from "node:sqlite";
import { seed } from "./seed";

const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

export const DATA_DIR = path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS schools (id INTEGER PRIMARY KEY, name TEXT NOT NULL, province TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, school_id INTEGER, class_name TEXT, title TEXT);
CREATE TABLE IF NOT EXISTS persons (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, is_pseudonym INTEGER DEFAULT 1, role TEXT, province TEXT, district TEXT, birth_year INTEGER, bio TEXT, created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS lineage (id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL, student_id INTEGER NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS instruments (id INTEGER PRIMARY KEY, name_th TEXT NOT NULL, name_lo TEXT, name_en TEXT, family TEXT, description TEXT);
CREATE TABLE IF NOT EXISTS works (id INTEGER PRIMARY KEY, title TEXT NOT NULL, alt_titles TEXT, genre TEXT, description TEXT);
CREATE TABLE IF NOT EXISTS variants (id INTEGER PRIMARY KEY, work_id INTEGER NOT NULL, person_id INTEGER, name TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS consents (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL, access_level INTEGER NOT NULL, tk_labels TEXT DEFAULT '[]', method TEXT, scope_note TEXT, evidence_path TEXT, granted_at TEXT, revoked_at TEXT, recorded_by INTEGER);
CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, person_id INTEGER, consent_id INTEGER, province TEXT, district TEXT, place TEXT, recorded_on TEXT, collector_id INTEGER, checklist TEXT DEFAULT '{}', status TEXT DEFAULT 'draft', notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS assets (id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL, kind TEXT, content_type TEXT, track_label TEXT, instrument_id INTEGER, filename TEXT, path TEXT, mime TEXT, size INTEGER, sha256 TEXT, duration_s REAL, analysis TEXT, fixity_checked_at TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS segments (id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL, asset_id INTEGER, kind TEXT NOT NULL, start_ms INTEGER, end_ms INTEGER, work_id INTEGER, variant_id INTEGER, instrument_id INTEGER, notation TEXT, transcript TEXT, ai_suggestion TEXT, ai_confidence REAL, status TEXT DEFAULT 'pending', review_note TEXT, reviewed_by INTEGER, reviewed_at TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS tunings (id INTEGER PRIMARY KEY, segment_id INTEGER, instrument_id INTEGER, person_id INTEGER, base_hz REAL, steps TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY, title TEXT NOT NULL, grade TEXT, indicator TEXT, description TEXT, segment_id INTEGER, instrument_id INTEGER, notation TEXT NOT NULL, tempo INTEGER DEFAULT 140, difficulty INTEGER DEFAULT 1, base_hz REAL, created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS assignments (id INTEGER PRIMARY KEY, teacher_id INTEGER, lesson_id INTEGER, class_name TEXT, due_on TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS practice_attempts (id INTEGER PRIMARY KEY, user_id INTEGER, lesson_id INTEGER, mode TEXT, speed REAL, accuracy REAL, timing_ms REAL, bar_errors TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS kb_chunks (id INTEGER PRIMARY KEY, source_type TEXT, source_id INTEGER, consent_id INTEGER, access_level INTEGER NOT NULL, title TEXT, text TEXT NOT NULL, citation TEXT, person_id INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS tutor_flags (id INTEGER PRIMARY KEY, user_id INTEGER, question TEXT, answer TEXT, note TEXT, status TEXT DEFAULT 'open', created_at TEXT);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, target TEXT, detail TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS media_jobs (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, prompt_th TEXT, prompt TEXT NOT NULL, size TEXT, seconds REAL, status TEXT DEFAULT 'queued', progress INTEGER DEFAULT 0, remote_id TEXT, path TEXT, mime TEXT, error TEXT, lesson_id INTEGER, created_by INTEGER, created_at TEXT, started_at TEXT, finished_at TEXT);
CREATE INDEX IF NOT EXISTS idx_segments_status ON segments(status);
CREATE INDEX IF NOT EXISTS idx_kb_consent ON kb_chunks(consent_id);
`;

const g = globalThis as unknown as { __pinphatDb?: DB };

export function db(): DB {
  if (g.__pinphatDb) return g.__pinphatDb;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "pinphat.db"));
  d.exec(SCHEMA);
  g.__pinphatDb = d;
  const n = d.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n.n === 0) {
    seed();
  }
  return d;
}

type Params = SQLInputValue[];

/** แถวจาก node:sqlite เป็น object แบบ null-prototype ต้องแปลงเป็น object ธรรมดาก่อนส่งให้ client component */
export function all<T>(sql: string, ...params: Params): T[] {
  return (db().prepare(sql).all(...params) as object[]).map((r) => ({ ...r }) as T);
}

export function one<T>(sql: string, ...params: Params): T | undefined {
  const r = db().prepare(sql).get(...params) as object | undefined;
  return r ? ({ ...r } as T) : undefined;
}

export function run(sql: string, ...params: Params): { id: number; changes: number } {
  const r = db().prepare(sql).run(...params);
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function now(): string {
  return new Date().toISOString();
}

export function audit(userId: number, action: string, target: string, detail = ""): void {
  run("INSERT INTO audit_log (user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?)", userId, action, target, detail, now());
}
