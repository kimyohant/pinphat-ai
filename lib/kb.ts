// คลังความรู้สำหรับครูผู้ช่วย AI: สร้างดัชนีจากข้อมูลที่ผ่านการรับรอง และค้นคืนตามสิทธิ์ของผู้ถาม
// ใช้การจับคู่ตัวอักษรสามตัว (character trigram) เพราะภาษาไทยไม่มีการเว้นวรรคระหว่างคำ
import { all, one, run, now } from "./db";
import { CONTENT_TYPES } from "./access";

type SegmentRow = {
  id: number;
  session_id: number;
  kind: string;
  notation: string | null;
  transcript: string | null;
  status: string;
  start_ms: number | null;
  end_ms: number | null;
  code: string;
  person_id: number | null;
  person: string | null;
  consent_id: number | null;
  access_level: number | null;
  revoked_at: string | null;
  work: string | null;
  variant: string | null;
  instrument: string | null;
  ai_suggestion: string | null;
};

const SEGMENT_SQL = `
SELECT sg.id, sg.session_id, sg.kind, sg.notation, sg.transcript, sg.status, sg.start_ms, sg.end_ms, sg.ai_suggestion,
       s.code, s.person_id, p.display_name AS person, s.consent_id, c.access_level, c.revoked_at,
       w.title AS work, v.name AS variant, i.name_th AS instrument
FROM segments sg
JOIN sessions s ON s.id = sg.session_id
LEFT JOIN persons p ON p.id = s.person_id
LEFT JOIN consents c ON c.id = s.consent_id
LEFT JOIN works w ON w.id = sg.work_id
LEFT JOIN variants v ON v.id = sg.variant_id
LEFT JOIN instruments i ON i.id = sg.instrument_id
WHERE sg.id = ?`;

function fmtTime(ms: number | null): string {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function splitText(text: string, size = 420): string[] {
  const parts = text.split(/(?<=[.!?。]|\s{2,}|\n)/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > size && cur) {
      out.push(cur);
      cur = p;
    } else cur = cur ? cur + " " + p : p;
  }
  if (cur) out.push(cur);
  return out.length ? out : [text];
}

/** สร้างดัชนีใหม่สำหรับส่วนย่อยหนึ่งชิ้น (ลบของเดิมก่อน) — ไม่สร้างถ้ายังไม่รับรอง ถูกถอนความยินยอม หรือเป็นระดับปิด */
export function indexSegment(segmentId: number): number {
  run("DELETE FROM kb_chunks WHERE source_type = 'segment' AND source_id = ?", segmentId);
  const sg = one<SegmentRow>(SEGMENT_SQL, segmentId);
  if (!sg || sg.status !== "approved" || sg.revoked_at || sg.access_level == null || sg.access_level >= 5) return 0;
  const cite = `${sg.code} · ส่วนย่อย #${sg.id}${sg.start_ms != null ? ` · ${fmtTime(sg.start_ms)}–${fmtTime(sg.end_ms)}` : ""}`;
  const texts: { title: string; text: string }[] = [];
  const who = sg.person ?? "ไม่ระบุผู้ให้ข้อมูล";
  if (sg.kind === "interview" && sg.transcript) {
    splitText(sg.transcript).forEach((t, i, arr) =>
      texts.push({ title: `บทสัมภาษณ์ ${who}${arr.length > 1 ? ` (ตอนที่ ${i + 1})` : ""}`, text: t }),
    );
  } else if ((sg.kind === "performance" || sg.kind === "teaching") && sg.notation) {
    texts.push({
      title: `${sg.work ?? "เพลงไม่ระบุชื่อ"} · ${sg.variant ?? "ไม่ระบุทาง"}`,
      text: `${CONTENT_TYPES[sg.kind]}เพลง${sg.work ?? ""} ${sg.variant ?? ""} บรรเลงโดย${who} ด้วย${sg.instrument ?? "เครื่องดนตรีไม่ระบุ"} โน้ตที่ผ่านการรับรอง: ${sg.notation}${sg.transcript ? ` หมายเหตุ: ${sg.transcript}` : ""}`,
    });
  } else if (sg.kind === "tuning") {
    const ai = sg.ai_suggestion ? JSON.parse(sg.ai_suggestion) : null;
    const steps = ai?.tuning?.steps as { note: string; dev: number; cents: number }[] | undefined;
    if (steps) {
      texts.push({
        title: `ระบบเสียง${sg.instrument ?? ""} ของวง${who}`,
        text: `ผลวัดระบบเสียง${sg.instrument ?? ""}ของวง${who} ด = ${ai.tuning.baseHz} Hz ระยะห่างจาก ด (cents): ${steps
          .map((s) => `${s.note} ${s.cents} (ต่างจาก 7 เสียงเท่า ${s.dev >= 0 ? "+" : ""}${s.dev})`)
          .join(", ")}`,
      });
    }
  }
  for (const t of texts) {
    run(
      "INSERT INTO kb_chunks (source_type, source_id, consent_id, access_level, title, text, citation, person_id, created_at) VALUES ('segment', ?, ?, ?, ?, ?, ?, ?, ?)",
      sg.id,
      sg.consent_id,
      sg.access_level,
      t.title,
      t.text,
      cite,
      sg.person_id,
      now(),
    );
  }
  return texts.length;
}

/** สร้างดัชนีใหม่ทุกชิ้นที่อยู่ภายใต้ความยินยอมนี้ (ใช้หลังเปลี่ยนระดับสิทธิ์) */
export function reindexConsent(consentId: number): number {
  run("DELETE FROM kb_chunks WHERE consent_id = ?", consentId);
  const segs = all<{ id: number }>(
    "SELECT sg.id FROM segments sg JOIN sessions s ON s.id = sg.session_id WHERE s.consent_id = ? AND sg.status = 'approved'",
    consentId,
  );
  return segs.reduce((n, s) => n + indexSegment(s.id), 0);
}

export function addDoc(title: string, text: string, citation: string, level = 1): void {
  run(
    "INSERT INTO kb_chunks (source_type, source_id, consent_id, access_level, title, text, citation, person_id, created_at) VALUES ('doc', NULL, NULL, ?, ?, ?, ?, NULL, ?)",
    level,
    title,
    text,
    citation,
    now(),
  );
}

// ---------- ค้นคืน ----------

export type Chunk = {
  id: number;
  source_type: string;
  source_id: number | null;
  access_level: number;
  title: string;
  text: string;
  citation: string;
  score: number;
  coverage: number;
};

function norm(s: string): string {
  // ตัดวรรณยุกต์และเครื่องหมายเพื่อให้สะกดต่างกันเล็กน้อยยังจับคู่ได้
  return s.toLowerCase().replace(/[่-์]/g, "").replace(/[^\p{L}\p{N}฀-๿]+/gu, " ");
}

function grams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const word of norm(s).split(" ").filter(Boolean)) {
    if (word.length < 3) {
      out.set(word, (out.get(word) ?? 0) + 1);
      continue;
    }
    for (let i = 0; i + 3 <= word.length; i++) {
      const g3 = word.slice(i, i + 3);
      out.set(g3, (out.get(g3) ?? 0) + 1);
    }
  }
  return out;
}

/** หาบุคคลที่คำถามเอ่ยถึงด้วยรูปแบบ "ครู ก." / "ศิลปิน ง." หรือชื่อเต็ม */
function namedPersons(query: string): number[] {
  const persons = all<{ id: number; display_name: string }>("SELECT id, display_name FROM persons");
  const letters = [...query.matchAll(/(?:ครู(?:ภูมิปัญญา)?|ศิลปิน)\s*([ก-ฮ])\./g)].map((m) => m[1]);
  return persons
    .filter((p) => {
      const name = p.display_name.replace(/\s*\(นามสมมติ\)/, "");
      if (query.includes(name)) return true;
      const m = name.match(/\s([ก-ฮ])\.$/);
      return m ? letters.includes(m[1]) : false;
    })
    .map((p) => p.id);
}

const STOP = new Set(["อะไร", "อย่า", "ย่าง", "างไร", "ไหม", "ครับ", "ค่ะ", "บ้าง", "ได้", "ทำไม", "หรือ"]);

/** ค้นคืนชิ้นความรู้ที่เกี่ยวข้องที่สุด เฉพาะระดับสิทธิ์ที่ผู้ถามเห็นได้ (กรองก่อนให้คะแนน) */
export function retrieve(query: string, levels: number[], k = 5): Chunk[] {
  if (!levels.length) return [];
  let rows = all<Omit<Chunk, "score" | "coverage"> & { person_id: number | null }>(
    `SELECT id, source_type, source_id, access_level, title, text, citation, person_id FROM kb_chunks WHERE access_level IN (${levels.map(() => "?").join(",")})`,
    ...levels,
  );
  // ถ้าคำถามเอ่ยถึงครูหรือศิลปินคนใดคนหนึ่ง (เช่น "ครู ค.") ให้ค้นเฉพาะความรู้ของบุคคลนั้น
  const named = namedPersons(query);
  if (named.length) rows = rows.filter((r) => r.person_id != null && named.includes(r.person_id));
  if (!rows.length) return [];
  const docGrams = rows.map((r) => grams(r.title + " " + r.text));
  const df = new Map<string, number>();
  docGrams.forEach((m) => m.forEach((_, g) => df.set(g, (df.get(g) ?? 0) + 1)));
  const q = [...grams(query).keys()].filter((g) => !STOP.has(g));
  const N = rows.length;
  const idf = (g: string) => Math.log(1 + (N - (df.get(g) ?? 0) + 0.5) / ((df.get(g) ?? 0) + 0.5));
  const qWeight = q.reduce((s, g) => s + (df.has(g) ? idf(g) : 0), 0) || 1;
  const scored = rows.map((r, i) => {
    const d = docGrams[i];
    let len = 0;
    d.forEach((c) => (len += c));
    let s = 0;
    let covered = 0;
    for (const g of q) {
      const tf = d.get(g);
      if (!tf) continue;
      covered += idf(g);
      s += (idf(g) * (tf * 2.2)) / (tf + 1.2 * (0.25 + (0.75 * len) / 220));
    }
    // สัดส่วนคำถามที่พบในเอกสาร (ถ่วงด้วยความหายากของคำ) ช่วยกันเอกสารที่ตรงแค่คำทั่วไปอย่าง "ครู"
    return { ...r, score: s, coverage: covered / qWeight };
  });
  const top = scored.filter((c) => c.coverage >= 0.3).sort((a, b) => b.score - a.score);
  if (!top.length) return [];
  const best = top[0].score;
  return top.filter((c) => c.score >= best * 0.5).slice(0, k);
}

/** ประโยคที่ตรงกับคำถามมากที่สุดในชิ้นความรู้ (ใช้ตอนไม่มี LLM) */
export function bestSentences(query: string, text: string, max = 2): string {
  const q = grams(query);
  const sentences = text.split(/(?<=[.!?])\s+|\s{2,}/).filter((s) => s.trim().length > 12);
  if (sentences.length <= max) return text;
  const scored = sentences.map((s, i) => {
    const g = grams(s);
    let hit = 0;
    q.forEach((_, k) => g.has(k) && !STOP.has(k) && hit++);
    return { s, i, hit };
  });
  return scored
    .sort((a, b) => b.hit - a.hit)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s.trim())
    .join(" … ");
}
