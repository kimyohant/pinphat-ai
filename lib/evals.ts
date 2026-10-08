// การประเมินโมเดลภาษา (bake-off): ทุกโมเดลตอบคำถามชุดเดียวกันจากแหล่งข้อมูลที่ตรึงไว้ชุดเดียวกัน
// ด้วย prompt เดียวกับครูผู้ช่วยจริง แล้วผู้เชี่ยวชาญให้คะแนนแบบไม่รู้ว่าคำตอบมาจากโมเดลไหน
import { all, db, now, one, run } from "./db";
import { retrieve, type Chunk } from "./kb";
import { SYSTEM, extractiveAnswer, userTurn } from "./llm";
import { UNSLOTH, acquireGpu, call, remoteGeneration, unslothEnabled, UnslothError } from "./unsloth";
import { aiConfig, claudeClient } from "./ai-config";

// ---------- ตาราง ----------

let ready = false;
/** สร้างตารางเองครั้งแรกที่ใช้ (แยกจาก migrate.ts เพื่อไม่ชนกับงานอื่นที่แก้ไฟล์นั้นอยู่) */
export function ensureEvalTables(): void {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS eval_sets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, levels TEXT DEFAULT '[1,2]', created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS eval_items (id INTEGER PRIMARY KEY, set_id INTEGER NOT NULL, question TEXT NOT NULL, reference TEXT, answerable INTEGER DEFAULT 1, sources TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS eval_runs (id INTEGER PRIMARY KEY, set_id INTEGER NOT NULL, label TEXT NOT NULL, config TEXT NOT NULL, status TEXT DEFAULT 'queued', progress INTEGER DEFAULT 0, error TEXT, created_by INTEGER, created_at TEXT, finished_at TEXT);
CREATE TABLE IF NOT EXISTS eval_answers (id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL, item_id INTEGER NOT NULL, answer TEXT, skipped TEXT, latency_ms INTEGER, cite_ok INTEGER, abstained INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS eval_scores (id INTEGER PRIMARY KEY, answer_id INTEGER NOT NULL, rater_id INTEGER NOT NULL, accuracy INTEGER, grounding INTEGER, language INTEGER, decision_ok INTEGER, comment TEXT, created_at TEXT, UNIQUE(answer_id, rater_id));
CREATE INDEX IF NOT EXISTS idx_eval_answers_run ON eval_answers(run_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_answer ON eval_scores(answer_id);
`);
  ready = true;
  if ((one<{ n: number }>("SELECT COUNT(*) AS n FROM eval_sets")?.n ?? 0) === 0) seedExampleSet();
}

/** ชุดทดสอบตัวอย่างจากข้อมูลสมมติในคลัง มีคำถามที่ตอบได้ ตอบไม่ได้ และตอบได้เฉพาะสิทธิ์สูงกว่า */
function seedExampleSet(): void {
  const id = run(
    "INSERT INTO eval_sets (name, description, levels, created_by, created_at) VALUES (?, ?, '[1,2]', 0, ?)",
    "ชุดทดสอบตัวอย่าง (ข้อมูลสมมติ)",
    "ทดสอบด้วยสิทธิ์ระดับสถานศึกษา (เหมือนนักเรียนถาม) มีคำถามที่คลังไม่มีคำตอบ 3 ข้อ ไว้วัดการแต่งเรื่อง",
    now(),
  ).id;
  const items: [string, string, number][] = [
    ["ควรเริ่มฝึกระนาดอย่างไร", "ตีไล่เสียงช้า ๆ ทุกวันให้ได้ยินเสียงแต่ละลูกชัดก่อนค่อยเร่งความเร็ว และฟังเสียงฉิ่งเป็นหลัก (บทสัมภาษณ์ครูภูมิปัญญา ก.)", 1],
    ["ควรจับไม้ตีระนาดอย่างไร", "จับไม้ตีให้หลวม ข้อมือไม่เกร็ง ถ้าเกร็งเสียงจะแข็งและตีได้ไม่นาน (ครูภูมิปัญญา ก.)", 1],
    ["ท่อนที่มีโน้ตติดกันสามตัวควรฝึกอย่างไร", "ฝึกแยกท่อนนั้นช้า ๆ ก่อน แล้วค่อยต่อกับห้องก่อนหน้าและห้องถัดไป (ครูภูมิปัญญา ก.)", 1],
    ["ทางของครู ข. ต่างจากทางครู ก. อย่างไร", "ทางครู ข. เก็บถี่กว่า แทรกโน้ตซ้ำและโน้ตเชื่อม ส่วนทางครู ก. เดินทำนองห่าง (บทสัมภาษณ์ครูภูมิปัญญา ข.)", 1],
    ["อ่านโน้ตตัวเลขไทยอย่างไร", "ห้องละ 4 ช่อง คั่นด้วย | เครื่องหมาย - คือไม่ตีเสียงใหม่ ดํ คือเสียงสูง เสียงช่องสุดท้ายของห้องตรงกับฉับ", 1],
    ["ระนาดของวงครู ก. เทียบเสียงต่างจาก 7 เสียงเท่าอย่างไร", "แต่ละลูกคลาดจากค่าทฤษฎีหลายสิบ cents เช่น ร สูงไปราว +10 และ ม ต่ำไปราว -14 ตามผลวัดของวง", 1],
    ["ฆ้องวงใหญ่ใช้ทำอะไรในวง", "ฆ้องหลายลูกเรียงบนร้านรูปวงกลม ผู้บรรเลงนั่งกลางวง บรรเลงโครงทำนองหลักของเพลง", 1],
    ["แคนมีกี่ลูก", "คลังไม่มีข้อมูลเรื่องแคน ควรตอบว่ายังไม่มีข้อมูล", 0],
    ["วงพิณพาทย์ล้านช้างเกิดขึ้นในสมัยใด", "คลังไม่มีข้อมูลประวัติศาสตร์เรื่องนี้ ควรตอบว่ายังไม่มีข้อมูล ไม่แต่งประวัติเอง", 0],
    ["ครู ค. เรียนดนตรีกับใคร", "ข้อมูลนี้อยู่ในระดับนักวิจัย ผู้ถามระดับสถานศึกษาต้องได้คำตอบว่ายังไม่มีข้อมูล", 0],
  ];
  for (const [q, ref, ok] of items) run("INSERT INTO eval_items (set_id, question, reference, answerable, created_at) VALUES (?, ?, ?, ?, ?)", id, q, ref, ok, now());
}

// ---------- ชนิดข้อมูล ----------

export type EvalSet = { id: number; name: string; description: string | null; levels: string; created_at: string; items: number; runs: number };
export type EvalItem = { id: number; set_id: number; question: string; reference: string | null; answerable: number; sources: string | null };
export type RunConfig = { provider: "baseline" | "unsloth" | "claude"; model: string; variant?: string; thinking?: boolean };
export type EvalRun = { id: number; set_id: number; label: string; config: string; status: string; progress: number; error: string | null; created_at: string; finished_at: string | null };
export type SnapChunk = Pick<Chunk, "id" | "title" | "text" | "citation" | "access_level" | "source_type" | "source_id" | "score" | "coverage">;

export const NO_SOURCE_ANSWER = "ยังไม่มีข้อมูลเรื่องนี้ในคลังความรู้ที่คุณเข้าถึงได้ ลองถามครูดนตรีหรือครูภูมิปัญญาในชุมชน";

export function listSets(): EvalSet[] {
  ensureEvalTables();
  return all<EvalSet>(`SELECT s.*, (SELECT COUNT(*) FROM eval_items i WHERE i.set_id = s.id) AS items, (SELECT COUNT(*) FROM eval_runs r WHERE r.set_id = s.id) AS runs FROM eval_sets s ORDER BY s.id DESC`);
}

export function getSet(id: number): EvalSet | undefined {
  ensureEvalTables();
  return one<EvalSet>(`SELECT s.*, (SELECT COUNT(*) FROM eval_items i WHERE i.set_id = s.id) AS items, (SELECT COUNT(*) FROM eval_runs r WHERE r.set_id = s.id) AS runs FROM eval_sets s WHERE s.id = ?`, id);
}

export function items(setId: number): EvalItem[] {
  ensureEvalTables();
  return all<EvalItem>("SELECT * FROM eval_items WHERE set_id = ? ORDER BY id", setId);
}

export function runs(setId: number): EvalRun[] {
  ensureEvalTables();
  recoverRuns();
  return all<EvalRun>("SELECT * FROM eval_runs WHERE set_id = ? ORDER BY id", setId);
}

export function snapshot(item: EvalItem): SnapChunk[] {
  try {
    return item.sources ? (JSON.parse(item.sources) as SnapChunk[]) : [];
  } catch {
    return [];
  }
}

/** ตรึงแหล่งข้อมูลของทุกข้อ (ครั้งแรกที่รัน) ทุกโมเดลจึงได้แหล่งข้อมูลชุดเดียวกัน แม้คลังจะเปลี่ยนภายหลัง */
export function freezeSources(setId: number): void {
  const set = getSet(setId);
  if (!set) return;
  const levels = JSON.parse(set.levels || "[1,2]") as number[];
  for (const it of items(setId).filter((i) => i.sources == null)) {
    const chunks = retrieve(it.question, levels).map(({ id, title, text, citation, access_level, source_type, source_id, score, coverage }) => ({ id, title, text, citation, access_level, source_type, source_id, score, coverage }));
    run("UPDATE eval_items SET sources = ? WHERE id = ?", JSON.stringify(chunks), it.id);
  }
}

// ---------- ผู้เข้าแข่งขัน ----------

export type CandidateNote = "active" | "missing" | "publicOnly" | "noKey";
export type Candidate = { key: string; config: RunConfig; available: boolean; note?: CandidateNote };

async function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** ชื่อกลางที่เก็บในฐานข้อมูล (หน้าเว็บแปลงเป็นภาษาของผู้อ่านเอง) */
export function configKey(c: RunConfig): string {
  if (c.provider === "baseline") return "baseline";
  return `${c.provider}:${c.model}${c.variant ? `:${c.variant}` : ""}${c.provider === "unsloth" ? (c.thinking ? ":think" : ":fast") : ""}`;
}

/** โมเดลที่เลือกได้: ค้นคืนอย่างเดียว (เส้นฐาน), ทุกโมเดลข้อความที่ดาวน์โหลดไว้บนเซิร์ฟเวอร์ (ตอบตรง/คิดก่อนตอบ), และ Claude */
export async function candidates(): Promise<Candidate[]> {
  const out: Candidate[] = [{ key: "baseline", config: { provider: "baseline", model: "retrieval" }, available: true }];
  if (unslothEnabled()) {
    type Cached = { cached: { repo_id: string; task?: string }[] };
    const cached = await within(call("/api/models/cached-gguf", { timeoutMs: 6000 }).then((r) => r.json() as Promise<Cached>), 6000);
    const repos = new Set<string>([UNSLOTH.text]);
    for (const c of cached?.cached ?? []) if (!c.task || c.task === "text-generation") repos.add(c.repo_id);
    for (const repo of repos) {
      let variant = repo === UNSLOTH.text ? UNSLOTH.textVariant : undefined;
      if (!variant) {
        type V = { variants: { quant: string; downloaded: boolean }[] };
        const v = await within(call(`/api/models/gguf-variants?repo_id=${encodeURIComponent(repo)}`, { timeoutMs: 6000 }).then((r) => r.json() as Promise<V>), 6000);
        variant = v?.variants.find((x) => x.downloaded)?.quant;
      }
      for (const thinking of [false, true]) {
        const config: RunConfig = { provider: "unsloth", model: repo, variant, thinking };
        out.push({ key: configKey(config), config, available: Boolean(variant), note: !variant ? "missing" : repo === UNSLOTH.text ? "active" : undefined });
      }
    }
  }
  const cfg = aiConfig();
  const config: RunConfig = { provider: "claude", model: cfg.claudeModel };
  out.push({ key: configKey(config), config, available: Boolean(cfg.claudeKey), note: cfg.claudeKey ? "publicOnly" : "noKey" });
  return out;
}

// ---------- การรัน ----------

const g = globalThis as unknown as { __pinphatEvalRuns?: Set<number> };
const active = (g.__pinphatEvalRuns ??= new Set<number>());

function recoverRuns() {
  for (const r of all<{ id: number }>("SELECT id FROM eval_runs WHERE status IN ('queued', 'running')")) {
    if (!active.has(r.id)) run("UPDATE eval_runs SET status = 'failed', error = 'เซิร์ฟเวอร์แอปรีสตาร์ตระหว่างรัน', finished_at = ? WHERE id = ?", now(), r.id);
  }
}

/** ตรวจเลขอ้างอิงในคำตอบ: ทุก [n] ต้องชี้ไปยังแหล่งที่มีอยู่จริง และต้องมีอย่างน้อยหนึ่งตัว */
export function citeCheck(answer: string, nSources: number): number | null {
  if (nSources === 0) return null;
  const nums = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  if (!nums.length) return 0;
  return nums.every((n) => n >= 1 && n <= nSources) ? 1 : 0;
}

/** คำตอบที่บอกว่าไม่มีข้อมูล (ใช้ประเมินเบื้องต้นก่อนผู้เชี่ยวชาญให้คะแนน) */
export function looksAbstained(answer: string): boolean {
  return /ยังไม่มีข้อมูล|ไม่มีข้อมูล|ไม่มีรายละเอียด|ไม่พบข้อมูล|ไม่พบรายละเอียด|ไม่สามารถตอบ|ยังไม่มีการบันทึก|ບໍ່ມີຂໍ້ມູນ|no information|not in the (archive|sources)/i.test(answer);
}

function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function loadTextModel(model: string, variant?: string): Promise<void> {
  const st = await call("/v1/status").then((r) => r.json() as Promise<{ active_model: string | null }>);
  if (st.active_model?.split(":")[0] === model) return;
  // ห้ามสลับโมเดลระหว่างที่เซิร์ฟเวอร์กำลังสร้างรูปหรือวิดีโอ รอให้เสร็จก่อน
  for (let i = 0; i < 180; i++) {
    if (!(await remoteGeneration())) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  await call("/v1/load", {
    method: "POST",
    timeoutMs: 20 * 60_000,
    body: JSON.stringify({ model_path: model, gguf_variant: variant, max_seq_length: UNSLOTH.textContext, n_parallel: 2 }),
  });
}

async function answerOne(cfg: RunConfig, item: EvalItem, chunks: SnapChunk[]): Promise<{ answer: string | null; skipped?: string }> {
  if (!chunks.length) return { answer: NO_SOURCE_ANSWER };
  const asChunks = chunks as unknown as Chunk[];
  if (cfg.provider === "baseline") return { answer: extractiveAnswer(item.question, asChunks) };
  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "user" as const, content: userTurn(item.question, asChunks) },
  ];
  if (cfg.provider === "unsloth") {
    const res = await call("/v1/chat/completions", {
      method: "POST",
      timeoutMs: 10 * 60_000,
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: cfg.thinking ? 4000 : 900, temperature: 0.4, enable_thinking: Boolean(cfg.thinking) }),
    });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { answer: stripThinking(j.choices?.[0]?.message?.content ?? "") };
  }
  // Claude อยู่นอกเซิร์ฟเวอร์ของโครงการ: ส่งได้เฉพาะข้อที่แหล่งข้อมูลทุกชิ้นเป็นระดับสาธารณะ
  if (chunks.some((c) => c.access_level !== 1)) return { answer: null, skipped: "non-public" };
  const msg = await claudeClient().beta.messages.create({
    model: cfg.model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: userTurn(item.question, asChunks) }],
  });
  if (msg.stop_reason === "refusal") return { answer: null, skipped: "refusal" };
  return { answer: msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() };
}

async function execute(runId: number): Promise<void> {
  const r = one<EvalRun>("SELECT * FROM eval_runs WHERE id = ?", runId);
  if (!r) return;
  const cfg = JSON.parse(r.config) as RunConfig;
  const list = items(r.set_id);
  let release: (() => void) | null = null;
  try {
    run("UPDATE eval_runs SET status = 'running' WHERE id = ?", runId);
    if (cfg.provider === "unsloth") {
      // ถือ GPU ไว้ตลอดการรัน ครูผู้ช่วยจะตอบแบบค้นคืนจากคลังระหว่างนี้
      release = await acquireGpu(`eval:${runId}`);
      await loadTextModel(cfg.model, cfg.variant);
    }
    for (let k = 0; k < list.length; k++) {
      const it = list[k];
      const chunks = snapshot(it);
      const t0 = Date.now();
      let answer: string | null = null;
      let skipped: string | undefined;
      try {
        ({ answer, skipped } = await answerOne(cfg, it, chunks));
      } catch (e) {
        skipped = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
      }
      run(
        "INSERT INTO eval_answers (run_id, item_id, answer, skipped, latency_ms, cite_ok, abstained, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        runId,
        it.id,
        answer,
        skipped ?? null,
        Date.now() - t0,
        answer == null ? null : citeCheck(answer, chunks.length),
        answer == null ? null : looksAbstained(answer) ? 1 : 0,
        now(),
      );
      run("UPDATE eval_runs SET progress = ? WHERE id = ?", Math.round(((k + 1) / list.length) * 100), runId);
    }
    run("UPDATE eval_runs SET status = 'done', progress = 100, finished_at = ? WHERE id = ?", now(), runId);
  } catch (e) {
    run("UPDATE eval_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", e instanceof UnslothError || e instanceof Error ? e.message : String(e), now(), runId);
  } finally {
    release?.();
    active.delete(runId);
  }
}

export function startRun(setId: number, c: Candidate, userId: number): number {
  ensureEvalTables();
  freezeSources(setId);
  const id = run("INSERT INTO eval_runs (set_id, label, config, status, progress, created_by, created_at) VALUES (?, ?, ?, 'queued', 0, ?, ?)", setId, c.key, JSON.stringify(c.config), userId, now()).id;
  active.add(id);
  void execute(id);
  return id;
}

// ---------- ให้คะแนนแบบปกปิด ----------

export type BlindAnswer = { answerId: number; letter: string; answer: string };

/** สลับลำดับคำตอบต่อข้อและต่อผู้ให้คะแนน (คงที่ เปิดหน้าใหม่ได้ลำดับเดิม) ไม่แสดงชื่อโมเดล */
export function blindAnswers(itemId: number, raterId: number): BlindAnswer[] {
  const rows = all<{ id: number; answer: string }>(
    "SELECT a.id, a.answer FROM eval_answers a JOIN eval_runs r ON r.id = a.run_id WHERE a.item_id = ? AND r.status = 'done' AND a.answer IS NOT NULL ORDER BY a.id",
    itemId,
  );
  let seed = (itemId * 7919 + raterId * 104729) % 2147483647 || 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.map((r, i) => ({ answerId: r.id, letter: String.fromCharCode(65 + i), answer: r.answer }));
}

export function myScores(itemId: number, raterId: number) {
  return all<{ answer_id: number; accuracy: number; grounding: number; language: number; decision_ok: number; comment: string | null }>(
    "SELECT s.* FROM eval_scores s JOIN eval_answers a ON a.id = s.answer_id WHERE a.item_id = ? AND s.rater_id = ?",
    itemId,
    raterId,
  );
}

export function saveScore(answerId: number, raterId: number, s: { accuracy: number; grounding: number; language: number; decision_ok: number; comment: string }): void {
  run(
    `INSERT INTO eval_scores (answer_id, rater_id, accuracy, grounding, language, decision_ok, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(answer_id, rater_id) DO UPDATE SET accuracy = excluded.accuracy, grounding = excluded.grounding, language = excluded.language, decision_ok = excluded.decision_ok, comment = excluded.comment, created_at = excluded.created_at`,
    answerId,
    raterId,
    s.accuracy,
    s.grounding,
    s.language,
    s.decision_ok,
    s.comment,
    now(),
  );
}

/** จำนวนข้อที่ผู้ให้คะแนนคนนี้ให้คะแนนครบทุกคำตอบแล้ว */
export function raterProgress(setId: number, raterId: number): { done: number; total: number } {
  const total = items(setId).length;
  const done = all<{ item_id: number; need: number; got: number }>(
    `SELECT a.item_id, COUNT(*) AS need, SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END) AS got
     FROM eval_answers a JOIN eval_runs r ON r.id = a.run_id AND r.status = 'done'
     LEFT JOIN eval_scores s ON s.answer_id = a.id AND s.rater_id = ?
     JOIN eval_items i ON i.id = a.item_id AND i.set_id = ?
     WHERE a.answer IS NOT NULL GROUP BY a.item_id`,
    raterId,
    setId,
  ).filter((x) => x.need > 0 && x.got === x.need).length;
  return { done, total };
}

// ---------- สรุปผล ----------

export type RunResult = {
  run: EvalRun;
  answered: number;
  skipped: number;
  latency: number | null;
  citeOk: number | null;
  autoAbstainWrong: number | null;
  rated: number;
  accuracy: number | null;
  grounding: number | null;
  language: number | null;
  decisionOk: number | null;
  hallucination: number | null;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function results(setId: number): { runs: RunResult[]; raters: number; agreement: number | null; kappa: number | null } {
  const its = new Map(items(setId).map((i) => [i.id, i]));
  const out: RunResult[] = runs(setId).map((r) => {
    const ans = all<{ id: number; item_id: number; answer: string | null; skipped: string | null; latency_ms: number; cite_ok: number | null; abstained: number | null }>(
      "SELECT * FROM eval_answers WHERE run_id = ?",
      r.id,
    );
    const answered = ans.filter((a) => a.answer != null);
    const sc = all<{ answer_id: number; accuracy: number; grounding: number; language: number; decision_ok: number }>(
      "SELECT s.* FROM eval_scores s JOIN eval_answers a ON a.id = s.answer_id WHERE a.run_id = ?",
      r.id,
    );
    const itemOf = new Map(ans.map((a) => [a.id, its.get(a.item_id)]));
    const unans = sc.filter((s) => itemOf.get(s.answer_id)?.answerable === 0);
    // ประเมินเบื้องต้นอัตโนมัติ: ข้อที่ควรตอบว่าไม่มีข้อมูล แต่โมเดลตอบไปเลย
    // คำนวณจากข้อความทุกครั้ง เมื่อปรับตัวตรวจ ผลของการรันเก่าจะอัปเดตตาม
    const autoUnans = answered.filter((a) => its.get(a.item_id)?.answerable === 0).map((a) => ({ ...a, abstained: looksAbstained(a.answer ?? "") ? 1 : 0 }));
    const cites = answered.map((a) => a.cite_ok).filter((x): x is number => x != null);
    return {
      run: r,
      answered: answered.length,
      skipped: ans.length - answered.length,
      latency: avg(answered.map((a) => a.latency_ms)),
      citeOk: avg(cites),
      autoAbstainWrong: autoUnans.length ? autoUnans.filter((a) => !a.abstained).length / autoUnans.length : null,
      rated: new Set(sc.map((s) => s.answer_id)).size,
      accuracy: avg(sc.map((s) => s.accuracy)),
      grounding: avg(sc.map((s) => s.grounding)),
      language: avg(sc.map((s) => s.language)),
      decisionOk: avg(sc.map((s) => s.decision_ok)),
      hallucination: unans.length ? unans.filter((s) => s.decision_ok === 0).length / unans.length : null,
    };
  });

  // ความสอดคล้องระหว่างผู้ให้คะแนนสองคนแรก (Cohen's kappa ของการตัดสินใจตอบ/ไม่ตอบ)
  const raterIds = all<{ rater_id: number }>(
    "SELECT DISTINCT s.rater_id FROM eval_scores s JOIN eval_answers a ON a.id = s.answer_id JOIN eval_items i ON i.id = a.item_id WHERE i.set_id = ? ORDER BY s.rater_id",
    setId,
  ).map((x) => x.rater_id);
  let agreement: number | null = null;
  let kappa: number | null = null;
  if (raterIds.length >= 2) {
    const pairs = all<{ a: number; b: number }>(
      `SELECT s1.decision_ok AS a, s2.decision_ok AS b FROM eval_scores s1 JOIN eval_scores s2 ON s2.answer_id = s1.answer_id AND s2.rater_id = ?
       JOIN eval_answers x ON x.id = s1.answer_id JOIN eval_items i ON i.id = x.item_id WHERE s1.rater_id = ? AND i.set_id = ?`,
      raterIds[1],
      raterIds[0],
      setId,
    );
    if (pairs.length) {
      const po = pairs.filter((p) => p.a === p.b).length / pairs.length;
      const pa1 = pairs.filter((p) => p.a === 1).length / pairs.length;
      const pb1 = pairs.filter((p) => p.b === 1).length / pairs.length;
      const pe = pa1 * pb1 + (1 - pa1) * (1 - pb1);
      agreement = po;
      kappa = pe < 1 ? (po - pe) / (1 - pe) : null;
    }
  }
  return { runs: out, raters: raterIds.length, agreement, kappa };
}
