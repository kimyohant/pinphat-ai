// ข้อมูลสาธิตชุดขยายของคลังความรู้: ครู เพลง ทาง เสียง และบทสัมภาษณ์ทั้งหมดเป็นของสมมติ แต่งขึ้นเพื่อการนำเสนอ
// ทุกแถวที่สร้างถูกจดไว้ในตาราง demo_rows จึงลบออกได้หมดด้วย clearDemoArchive() เมื่อมีข้อมูลภาคสนามจริง
// ห้ามนำชื่อเพลง ทาง หรือเนื้อหาสัมภาษณ์ในไฟล์นี้ไปอ้างเป็นข้อเท็จจริงของดนตรีพิณพาทย์ล้านช้าง
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MEDIA_DIR, all, db, one, run, tx } from "./db";
import { analyzeWav, synthNotation, synthTuningSweep } from "./audio";
import { indexSegment } from "./kb";

const T = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();

function track(tbl: string, id: number) {
  run("INSERT INTO demo_rows (tbl, row_id) VALUES (?, ?)", tbl, id);
  return id;
}

function ensureTable() {
  db().exec("CREATE TABLE IF NOT EXISTS demo_rows (tbl TEXT NOT NULL, row_id INTEGER NOT NULL)");
}

export function demoExpanded(): boolean {
  ensureTable();
  return Boolean(one("SELECT 1 FROM demo_rows LIMIT 1"));
}

// ---------- ทำนองสมมติ: เดินบนบันไดห้าเสียง สร้างซ้ำได้เหมือนเดิมทุกครั้งจากเลขตั้งต้น ----------
const LADDER = ["ด", "ร", "ม", "ซ", "ล", "ดํ"];

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/** ทางห่าง: โน้ตหลักบนจังหวะที่สองและสี่ ห้องสุดท้ายลงที่ ด */
function sparse(seed: number, bars = 8): string {
  const r = rng(seed);
  let i = 2;
  const out: string[] = [];
  for (let b = 0; b < bars - 1; b++) {
    const a = LADDER[i];
    i = Math.max(0, Math.min(LADDER.length - 1, i + [-2, -1, 1, 2][Math.floor(r() * 4)]));
    out.push(`- ${a} - ${LADDER[i]}`);
  }
  out.push("- - - ด");
  return out.join(" | ");
}

/** ทางเก็บ: เติมโน้ตเชื่อมระหว่างโน้ตหลักของทางห่าง ให้ห้องหนึ่งมีสี่เสียง */
function dense(sparseNotation: string): string {
  return sparseNotation
    .split("|")
    .map((bar) => {
      const t = bar.trim().split(/\s+/);
      const [a, b] = [t[1], t[3]];
      if (a === "-" || !a) return bar.trim();
      const ia = LADDER.indexOf(a);
      const ib = LADDER.indexOf(b);
      const pass = LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.round((ia + ib) / 2)))];
      const neigh = LADDER[Math.min(LADDER.length - 1, ia + 1)];
      return `${neigh} ${a} ${pass} ${b}`;
    })
    .join(" | ");
}

// ---------- ข้อมูลสมมติ ----------
type P = [string, "master" | "artist", string, string, number, string];
const PERSONS: P[] = [
  ["ครูภูมิปัญญา ช.", "master", "มุกดาหาร", "หว้านใหญ่", 1949, "หัวหน้าวงประจำวัดริมโขง เป่าปี่มากว่า 50 ปี สอนการเป่าลมยาวโดยเก็บลมไว้ที่แก้ม"],
  ["ครูภูมิปัญญา ซ.", "master", "บึงกาฬ", "เซกา", 1952, "ครูกลองที่ขึ้นหนังกลองเอง จดหน้าทับด้วยพยางค์ที่คิดขึ้นสำหรับสอนเด็ก"],
  ["ครูภูมิปัญญา ฌ.", "master", "หนองบัวลำภู", "นากลาง", 1955, "เชี่ยวชาญระนาดทุ้ม เล่นทางหยอกล้อตอบระนาดเอก"],
  ["ครูภูมิปัญญา ญ.", "master", "สกลนคร", "พรรณานิคม", 1941, "ช่างทำและเทียบเสียงลูกระนาด ใช้ขี้ผึ้งผสมผงตะกั่วถ่วงใต้ลูก"],
  ["ครูภูมิปัญญา ด.", "master", "เลย", "ด่านซ้าย", 1940, "ครูอาวุโสสายภูเขา บรรเลงเพลงช้าที่ใช้ก่อนพิธีกรรมของหมู่บ้าน"],
  ["ศิลปิน ฐ.", "artist", "มุกดาหาร", "เมืองมุกดาหาร", 1979, "ศิษย์ครู ช. เป่าปี่ในงานบุญ สอนเยาวชนวันเสาร์ที่ศาลาวัด"],
  ["ศิลปิน ฒ.", "artist", "บึงกาฬ", "เมืองบึงกาฬ", 1988, "ศิษย์ครู ซ. ตีกลองและฉิ่งในวงดนตรีของโรงเรียน"],
  ["ศิลปิน ณ.", "artist", "อุดรธานี", "กุมภวาปี", 1983, "ศิษย์ครู ค. ตีฆ้องวงใหญ่ ช่วยครูจดเพลงลงสมุดโน้ต"],
  ["ศิลปิน ต.", "artist", "หนองคาย", "โพนพิสัย", 1993, "ศิษย์ศิลปิน จ. สอนผ่านกลุ่มวิดีโอของชุมชน"],
  ["ศิลปิน ถ.", "artist", "หนองบัวลำภู", "เมืองหนองบัวลำภู", 1986, "ศิษย์ครู ฌ. เล่นระนาดทุ้มในวงประจำอำเภอ"],
];
// [ครู, ศิษย์] ตามลำดับใน PERSONS ค่าลบอ้างถึงบุคคลเดิมในข้อมูลสาธิตชุดแรก (id บวก)
const LINEAGE: [number, number, string][] = [
  [4, 0, "เรียนเป่าปี่จากครู ด. ที่ด่านซ้าย ก่อนย้ายลงมาริมโขง"],
  [0, 5, "ศิษย์ประจำวงวัด"],
  [1, 6, "เรียนผ่านวงดนตรีโรงเรียน"],
  [3, 2, "เรียนระนาดทุ้มที่โรงทำระนาดของครู ญ."],
  [2, 9, "ศิษย์ในวงประจำอำเภอ"],
  [-3, 7, "ช่วยครู ค. จดสมุดโน้ต"],
  [-5, 8, "เรียนผ่านโครงการโรงเรียนรุ่นที่สอง"],
];

type W = [string, string, string];
const WORKS: W[] = [
  ["ลมโขงยามเช้า", "เพลงลาว", "เพลงสมมติเพื่อการสาธิต · ทำนองช้า เปิดวงตอนเช้า ครูแต่ละสายเดินทำนองต่างกัน"],
  ["ฝนแรกนา", "เพลงบุญ", "เพลงสมมติเพื่อการสาธิต · ใช้ในงานบุญต้นฤดูทำนา"],
  ["แสงไต้", "เพลงเดี่ยว", "เพลงสมมติเพื่อการสาธิต · เพลงอวดฝีมือของระนาดเอก"],
  ["ดงภูพาน", "เพลงเรื่อง", "เพลงสมมติเพื่อการสาธิต · เพลงยาวหลายท่อน เล่าการเดินทางข้ามภู"],
  ["นาคเล่นน้ำ", "เพลงลาว", "เพลงสมมติเพื่อการสาธิต · ทำนองขึ้นลงเป็นคลื่น ฝึกเดินมือกว้าง"],
  ["บุญข้าวจี่", "เพลงบุญ", "เพลงสมมติเพื่อการสาธิต · บรรเลงระหว่างเตรียมงานบุญเดือนสาม"],
  ["ครามสกล", "เพลงฝึกหัด", "เพลงสมมติเพื่อการสาธิต · แบบฝึกสำหรับวงโรงเรียน"],
  ["หมอกภูเรือ", "เพลงพิธีกรรม", "เพลงสมมติเพื่อการสาธิต · เพลงช้าก่อนพิธี ใช้ภายในชุมชน"],
  ["เรือไฟริมโขง", "เพลงลาว", "เพลงสมมติเพื่อการสาธิต · เพลงเร็ว ใช้ปิดวง"],
];
// [เพลง, บุคคล, ชื่อทาง, แบบ, เครื่อง, ระดับสิทธิ์ของรอบนั้น]
const VARIANTS: [number, number, string, "sparse" | "dense", number][] = [
  [0, 0, "ทางครู ช.", "sparse", 1],
  [0, 3, "ทางครู ญ.", "dense", 1],
  [1, 1, "ทางครู ซ.", "sparse", 1],
  [1, 6, "ทางศิลปิน ฒ.", "dense", 1],
  [2, 3, "ทางครู ญ.", "dense", 1],
  [2, 9, "ทางศิลปิน ถ.", "sparse", 2],
  [3, 2, "ทางครู ฌ.", "sparse", 2],
  [3, 7, "ทางศิลปิน ณ.", "dense", 3],
  [4, 5, "ทางศิลปิน ฐ.", "sparse", 1],
  [4, 8, "ทางศิลปิน ต.", "dense", 1],
  [5, 1, "ทางครู ซ.", "dense", 1],
  [6, 6, "ทางศิลปิน ฒ.", "sparse", 1],
  [6, 9, "ทางศิลปิน ถ.", "dense", 2],
  [7, 4, "ทางครู ด.", "sparse", 1],
  [8, 0, "ทางครู ช.", "dense", 1],
  [8, 5, "ทางศิลปิน ฐ.", "sparse", 1],
];
// ระดับสิทธิ์ ป้าย TK วิธียินยอม ขอบเขต ของแต่ละบุคคล
const CONSENT: [number, string[], string, string][] = [
  [2, ["TK A", "TK NC"], "voice", "ใช้ในสถานศึกษาได้ ขอให้ระบุชื่อวงประจำวัด"],
  [1, ["TK A"], "signature", "เผยแพร่ได้ทั้งหมด ยินดีให้เด็กนำไปฝึก"],
  [2, ["TK A"], "voice", "ใช้ในสถานศึกษาได้"],
  [1, ["TK A", "TK NC"], "witness", "เผยแพร่ได้ ห้ามใช้เชิงพาณิชย์"],
  [4, ["TK CO", "TK SS"], "witness", "เพลงก่อนพิธีให้ใช้ภายในชุมชนเท่านั้น"],
  [1, ["TK A"], "voice", "เผยแพร่ได้"],
  [2, ["TK A"], "signature", "ใช้ในสถานศึกษาได้"],
  [3, ["TK A", "TK CS"], "witness", "สมุดโน้ตของครูให้ใช้ในงานวิจัยเท่านั้น"],
  [1, ["TK A"], "voice", "เผยแพร่ได้ ขอให้ระบุชื่อกลุ่มชุมชน"],
  [2, ["TK A"], "voice", "ใช้ในสถานศึกษาได้"],
];
// ระบบเสียงของแต่ละวง (ค่าเพี้ยนจาก 7 เสียงเท่า หน่วย cents) [บุคคล, ด Hz, ค่าเพี้ยน, เครื่อง]
const TUNINGS: [number, number, number[], number][] = [
  [0, 286, [0, -11, 7, 14, -6, 9, -3], 1],
  [3, 274, [0, 4, -9, 11, 3, -12, 6], 1],
  [2, 268, [0, 13, -5, -8, 10, 2, -14], 2],
  [4, 262, [0, -4, -16, 8, 12, -7, 9], 3],
];
// บทสัมภาษณ์สมมติ [บุคคล, ข้อความ]
const INTERVIEWS: [number, string][] = [
  [0, "เป่าปี่ต้องเก็บลมไว้ที่แก้ม ให้เสียงไม่ขาดตอนเปลี่ยนลมหายใจ ช่วงแรกให้เป่าเสียงเดียวยาว ๆ ทุกเช้าจนเสียงนิ่ง.  ลิ้นปี่ผมทำเองจากใบตาลตากแห้ง ลิ้นที่ดีต้องตอบสนองเร็วแต่ไม่แตก."],
  [0, "เวลาวงเทียบเสียง ผมให้ทุกเครื่องฟังปี่ก่อน แล้วค่อยปรับระนาดกับฆ้องเข้าหา เพราะปี่ปรับเสียงได้น้อยที่สุดในวงของเรา.  ถ้าอากาศหนาว ลิ้นปี่จะแข็ง ต้องอุ่นด้วยมือก่อนเป่า."],
  [1, "กลองใบนี้ผมขุดจากไม้ขนุน ขึ้นหนังวัวเอง ขันเชือกจนหน้ากลองตึงพอดี.  สอนเด็กผมใช้พยางค์ ตุ๊บ กับ ป๊ะ แทนชื่อการตีจริง เด็กจำง่าย ตุ๊บคือตีกลางหน้าให้ก้อง ป๊ะคือตีแล้วกดมือไว้ให้เสียงสั้น."],
  [1, "ฉิ่งเป็นหัวใจของวง ฉิ่งเปิดให้ก้อง ฉับประกบปิด คนตีกลองต้องฟังฉับตลอด ถ้าฉับหาย วงจะหลงทันที.  เด็กที่เพิ่งเข้าวง ผมให้ตีฉิ่งก่อนเครื่องอื่นหนึ่งเดือน."],
  [2, "ระนาดทุ้มไม่ได้เดินตามระนาดเอก ทุ้มจะหยอกล้อ เว้นจังหวะ แล้วตอบกลับ เหมือนคนคุยกัน.  เวลาสอน ผมให้ฟังระนาดเอกก่อนจนจำทำนองได้ แล้วค่อยหาช่องว่างที่ทุ้มจะแทรกเข้าไป."],
  [2, "ผมเรียนระนาดทุ้มที่โรงทำระนาดของครู ญ. ได้ยินเสียงไม้ทุกวัน เลยรู้ว่าลูกไหนเสียงเพี้ยนก่อนครูจะบอก."],
  [3, "ลูกระนาดต้องเทียบเสียงตอนเช้ามืด เพราะเงียบที่สุด ผมถ่วงขี้ผึ้งผสมผงตะกั่วใต้ลูก ถ่วงมากเสียงต่ำลง ขูดออกเสียงสูงขึ้น.  แต่ละวงชอบเสียงไม่เหมือนกัน ผมจึงจดค่าของแต่ละวงไว้ในสมุด."],
  [4, "เพลงช้าชุดนี้ใช้ก่อนพิธีของหมู่บ้านเท่านั้น ต้องไหว้ครูก่อนบรรเลง และไม่ให้นำไปเล่นในงานรื่นเริง.  คนที่จะเรียนต้องเป็นคนในชุมชน และเรียนจากผู้อาวุโสระหว่างเตรียมงาน."],
  [4, "สมัยก่อนหมู่บ้านบนภูมีวงพิณพาทย์เกือบทุกวัด เครื่องดนตรีขนขึ้นเขาด้วยเกวียน ตอนนี้เหลือไม่กี่วงที่ยังเล่นครบ."],
  [5, "ผมเรียนปี่กับครู ช. ที่ศาลาวัดทุกวันเสาร์ ตอนนี้สอนเด็กอายุราวสิบสองขวบ ให้เริ่มจากโน้ตสั้น ๆ ก่อน ยังไม่ให้เป่าลมยาว เพราะเด็กจะเหนื่อยและท้อ."],
  [6, "ในวงโรงเรียน ผมให้นักเรียนตีฉิ่งตามเพลงจากลำโพงก่อนจะร่วมวงจริง พอจับจังหวะได้แล้วค่อยเปลี่ยนไปตีกลอง.  เด็กที่ตีฉิ่งแม่น ตีกลองก็จะแม่นตาม."],
  [7, "ผมช่วยครู ค. จดเพลงลงสมุดโน้ตมาหลายปี ครูจำเพลงด้วยเสียง ส่วนผมจดเป็นตัวเลข บางท่อนครูเล่นไม่เหมือนเดิมทุกครั้ง เราจึงจดไว้หลายแบบ."],
  [8, "ผมสอนผ่านกลุ่มวิดีโอของชุมชน ให้เด็กอัดคลิปตัวเองตีระนาดแล้วส่งมา ผมดูแล้วบอกว่าห้องไหนต้องแก้ เด็กที่อยู่ไกลก็เรียนได้."],
  [9, "วงประจำอำเภอเล่นในงานวัดเกือบทุกเดือน ระนาดทุ้มของผมต้องฟังทั้งระนาดเอกและฆ้องวง เพราะทุ้มอยู่ตรงกลางระหว่างสองเครื่องนั้น."],
];

function writeMedia(sessionId: number, name: string, buf: Buffer) {
  const dir = path.join(/*turbopackIgnore: true*/ MEDIA_DIR, String(sessionId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir, name), buf);
  return { rel: path.join(/*turbopackIgnore: true*/ String(sessionId), name), sha: crypto.createHash("sha256").update(buf).digest("hex"), size: buf.length };
}

function addAudio(sessionId: number, name: string, buf: Buffer, contentType: string, trackLabel: string, instrumentId: number, daysAgo: number) {
  const f = writeMedia(sessionId, name, buf);
  const analysis = analyzeWav(buf, contentType);
  const id = run(
    "INSERT INTO assets (session_id, kind, content_type, track_label, instrument_id, filename, path, mime, size, sha256, duration_s, analysis, fixity_checked_at, created_at) VALUES (?, 'audio', ?, ?, ?, ?, ?, 'audio/wav', ?, ?, ?, ?, ?, ?)",
    sessionId,
    contentType,
    trackLabel,
    instrumentId,
    name,
    f.rel,
    f.size,
    f.sha,
    analysis?.durationSec ?? null,
    analysis ? JSON.stringify({ peaks: analysis.peaks, durationSec: analysis.durationSec, sampleRate: analysis.sampleRate }) : null,
    T(daysAgo),
    T(daysAgo),
  ).id;
  track("assets", id);
  return { assetId: id, analysis };
}

function insSeg(sessionId: number, assetId: number | null, kind: string, durMs: number | null, workId: number | null, variantId: number | null, instrumentId: number | null, notation: string | null, transcript: string | null, ai: unknown, conf: number | null, status: "approved" | "pending", daysAgo: number) {
  const id = run(
    "INSERT INTO segments (session_id, asset_id, kind, start_ms, end_ms, work_id, variant_id, instrument_id, notation, transcript, ai_suggestion, ai_confidence, status, reviewed_by, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    sessionId,
    assetId,
    kind,
    durMs == null ? null : 0,
    durMs,
    workId,
    variantId,
    instrumentId,
    notation,
    transcript,
    ai ? JSON.stringify(ai) : null,
    conf,
    status,
    status === "pending" ? null : 9,
    status === "pending" ? null : T(daysAgo - 2),
    T(daysAgo),
  ).id;
  return track("segments", id);
}

/** เพิ่มข้อมูลสาธิตชุดขยาย ทำครั้งเดียว ถ้าเคยเพิ่มแล้วจะไม่ทำซ้ำ */
export function expandDemoArchive(): boolean {
  ensureTable();
  if (demoExpanded()) return false;
  const toIndex: number[] = [];
  tx(() => {
    const personIds = PERSONS.map(([name, role, prov, dist, by, bio], i) =>
      track(
        "persons",
        run(
          "INSERT INTO persons (display_name, is_pseudonym, role, province, district, birth_year, bio, created_by, created_at) VALUES (?, 1, ?, ?, ?, ?, ?, 8, ?)",
          `${name} (นามสมมติ)`,
          role,
          prov,
          dist,
          by,
          `${bio} (ข้อมูลสมมติ)`,
          T(90 - i),
        ).id,
      ),
    );
    const pid = (k: number) => (k < 0 ? -k : personIds[k]);
    for (const [teacher, student, note] of LINEAGE) {
      track("lineage", run("INSERT INTO lineage (teacher_id, student_id, note) VALUES (?, ?, ?)", pid(teacher), pid(student), note).id);
    }

    const workIds = WORKS.map(([title, genre, desc]) => track("works", run("INSERT INTO works (title, genre, description) VALUES (?, ?, ?)", title, genre, desc).id));

    // ความยินยอมและรอบบันทึก หนึ่งรอบต่อหนึ่งคน
    const sessionOf: number[] = [];
    PERSONS.forEach(([name, , prov, dist], i) => {
      const [lvl, tk, method, note] = CONSENT[i];
      const consentId = track(
        "consents",
        run("INSERT INTO consents (person_id, access_level, tk_labels, method, scope_note, granted_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, 8)", personIds[i], lvl, JSON.stringify(tk), method, note, T(70 - i * 3)).id,
      );
      const code = `S-2026-D${String(i + 1).padStart(2, "0")}`;
      const sid = track(
        "sessions",
        run(
          "INSERT INTO sessions (code, title, person_id, consent_id, province, district, place, recorded_on, collector_id, checklist, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 8, ?, 'submitted', ?)",
          code,
          `บันทึกสาธิต: ${name}`,
          personIds[i],
          consentId,
          prov,
          dist,
          `บ้าน${name.replace(/ \(.*$/, "")}`,
          T(68 - i * 3).slice(0, 10),
          JSON.stringify({ consent: true, tuning: true, performance: true, interview: true, photo: false }),
          T(68 - i * 3),
        ).id,
      );
      sessionOf.push(sid);
    });

    // ทาง การบรรเลง และเสียงสังเคราะห์
    VARIANTS.forEach(([w, p, name, style, inst], k) => {
      // ทางของเพลงเดียวกันใช้โครงทำนองเดียวกัน ต่างกันที่วิธีเดิน เหมือนทางของครูต่างสาย
      const base = sparse(1000 + w * 37);
      const notation = style === "dense" ? dense(base) : base;
      const vid = track("variants", run("INSERT INTO variants (work_id, person_id, name, description) VALUES (?, ?, ?, ?)", workIds[w], personIds[p], name, style === "dense" ? "ทางเก็บ แทรกโน้ตเชื่อมห้องละสี่เสียง (ข้อมูลสมมติ)" : "ทางห่าง เดินโน้ตหลักบนจังหวะสองและสี่ (ข้อมูลสมมติ)").id);
      const tune = TUNINGS.find((x) => x[0] === p);
      const audio = addAudio(
        sessionOf[p],
        `demo-${w + 1}-${k + 1}.wav`,
        synthNotation(notation, { baseHz: tune?.[1] ?? 276 + ((k * 7) % 20), devCents: tune?.[2], slotSec: style === "dense" ? 0.3 : 0.38, humanize: 0.01 }),
        "performance",
        `ไมค์ 1 · ${name}`,
        inst,
        60 - k,
      );
      // สองรอบท้ายค้างไว้ในคิวตรวจ ให้หน้าตรวจรับรองมีงาน
      const status = k >= VARIANTS.length - 2 ? "pending" : "approved";
      const seg = insSeg(sessionOf[p], audio.assetId, "performance", Math.round((audio.analysis?.durationSec ?? 0) * 1000), workIds[w], vid, inst, status === "approved" ? notation : null, null, audio.analysis, audio.analysis?.confidence ?? null, status, 58 - k);
      if (status === "approved") toIndex.push(seg);
    });

    // ระบบเสียงของแต่ละวง
    TUNINGS.forEach(([p, hz, dev, inst], k) => {
      const a = addAudio(sessionOf[p], `demo-tuning-${k + 1}.wav`, synthTuningSweep(hz, dev), "tuning", "ไมค์ 1 · ตีไล่เสียงรายลูก", inst, 55 - k);
      const seg = insSeg(sessionOf[p], a.assetId, "tuning", Math.round((a.analysis?.durationSec ?? 0) * 1000), null, null, inst, null, null, a.analysis, a.analysis?.confidence ?? null, "approved", 54 - k);
      if (a.analysis?.tuning) track("tunings", run("INSERT INTO tunings (segment_id, instrument_id, person_id, base_hz, steps, created_at) VALUES (?, ?, ?, ?, ?, ?)", seg, inst, personIds[p], a.analysis.tuning.baseHz, JSON.stringify(a.analysis.tuning.steps), T(52 - k)).id);
      toIndex.push(seg);
    });

    // บทสัมภาษณ์
    INTERVIEWS.forEach(([p, text], k) => {
      const seg = insSeg(sessionOf[p], null, "interview", null, null, null, null, null, `(บทสัมภาษณ์ตัวอย่าง) ${text}`, null, null, "approved", 50 - k);
      toIndex.push(seg);
    });
  });
  // ดัชนีของครู AI สร้างนอก transaction เพราะ indexSegment อ่านข้อมูลที่เพิ่งเขียน
  for (const id of toIndex) indexSegment(id);
  return true;
}

/** ลบข้อมูลสาธิตชุดขยายออกทั้งหมด รวมไฟล์เสียงและชิ้นความรู้ในดัชนีของครู AI */
export function clearDemoArchive(): number {
  ensureTable();
  const rows = all<{ tbl: string; row_id: number }>("SELECT tbl, row_id FROM demo_rows");
  if (!rows.length) return 0;
  const segIds = rows.filter((r) => r.tbl === "segments").map((r) => r.row_id);
  const sessionIds = rows.filter((r) => r.tbl === "sessions").map((r) => r.row_id);
  tx(() => {
    for (const id of segIds) run("DELETE FROM kb_chunks WHERE source_type = 'segment' AND source_id = ?", id);
    // ลบลูกก่อนแม่ ไม่ให้เหลือแถวที่อ้างถึงสิ่งที่ไม่มีแล้ว
    for (const tbl of ["tunings", "segments", "assets", "variants", "sessions", "consents", "lineage", "works", "persons"]) {
      for (const r of rows.filter((x) => x.tbl === tbl)) run(`DELETE FROM ${tbl} WHERE id = ?`, r.row_id);
    }
    run("DELETE FROM demo_rows");
  });
  for (const sid of sessionIds) fs.rmSync(path.join(/*turbopackIgnore: true*/ MEDIA_DIR, String(sid)), { recursive: true, force: true });
  return rows.length;
}
