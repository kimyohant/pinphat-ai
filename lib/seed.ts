// ข้อมูลตัวอย่างสมมติสำหรับสาธิตระบบ — บุคคล เพลง ทาง และเสียงทั้งหมดสร้างขึ้นเพื่อการสาธิต ไม่ใช่ข้อมูลภาคสนามจริง
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MEDIA_DIR, run, tx } from "./db";
import { analyzeWav, synthNotation, synthTuningSweep } from "./audio";
import { addDoc, indexSegment } from "./kb";

const T = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();

// โน้ตที่แต่งขึ้นเพื่อการสาธิต
export const NT = {
  scale: "- - - ด | - - - ร | - - - ม | - - - ฟ | - - - ซ | - - - ล | - - - ท | - - - ดํ | - - - ท | - - - ล | - - - ซ | - - - ฟ | - - - ม | - - - ร | - - - ด | - - - -",
  pairs: "- ด - ร | - ม - ซ | - ล - ซ | - ม - ร | - ด - ร | - ม - ร | - ด - ล | - - - ด",
  tangKor:
    "- ม - ซ | - ล - ดํ | - ล - ซ | - ม - ร | - ม ซ ล | - ซ - ม | - ร - ม | - - - ด | - ด - ร | - ม - ซ | - ล ซ ม | - ร - ด | - ร ม ซ | - ล - ซ | - ม - ร | - - - ด",
  tangKhor:
    "ร ม - ซ | ซ ล - ดํ | - ล ซ ซ | - ม ม ร | - ม ซ ล | ล ซ - ม | ม ร - ม | - - - ด | - ด ด ร | - ม ม ซ | ซ ล ซ ม | - ร - ด | - ร ม ซ | - ล ล ซ | - ม - ร | - - - ด",
  tangKhor3:
    "- ม - ซ | - ล - ดํ | - ล - ซ | - ม - ร | - ม ซ ล | - ซ - ม | - ร - ม | - - - ด",
};

function writeMedia(sessionId: number, name: string, buf: Buffer): { rel: string; sha: string; size: number } {
  const dir = path.join(/*turbopackIgnore: true*/ MEDIA_DIR, String(sessionId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir, name), buf);
  return { rel: path.join(/*turbopackIgnore: true*/ String(sessionId), name), sha: crypto.createHash("sha256").update(buf).digest("hex"), size: buf.length };
}

function addAudio(
  sessionId: number,
  name: string,
  buf: Buffer,
  contentType: string,
  track: string,
  instrumentId: number,
  daysAgo: number,
): { assetId: number; analysis: ReturnType<typeof analyzeWav> } {
  const f = writeMedia(sessionId, name, buf);
  const analysis = analyzeWav(buf, contentType);
  const a = run(
    "INSERT INTO assets (session_id, kind, content_type, track_label, instrument_id, filename, path, mime, size, sha256, duration_s, analysis, fixity_checked_at, created_at) VALUES (?, 'audio', ?, ?, ?, ?, ?, 'audio/wav', ?, ?, ?, ?, ?, ?)",
    sessionId,
    contentType,
    track,
    instrumentId,
    name,
    f.rel,
    f.size,
    f.sha,
    analysis?.durationSec ?? null,
    analysis ? JSON.stringify({ peaks: analysis.peaks, durationSec: analysis.durationSec, sampleRate: analysis.sampleRate }) : null,
    T(daysAgo),
    T(daysAgo),
  );
  return { assetId: a.id, analysis };
}

export function seed(): void {
  tx(() => {
    // สถานศึกษาและผู้ใช้ทดลอง
    run("INSERT INTO schools (id, name, province) VALUES (1, 'โรงเรียนตัวอย่างวิทยา', 'สกลนคร'), (2, 'โรงเรียนบ้านตัวอย่าง', 'นครพนม')");
    const users: [string, string, number | null, string | null, string][] = [
      ["น้องพิณ", "student", 1, "ม.2/1", "นักเรียนตัวอย่าง"],
      ["นักเรียน ข.", "student", 1, "ม.2/1", "นักเรียนตัวอย่าง"],
      ["นักเรียน ค.", "student", 1, "ม.2/1", "นักเรียนตัวอย่าง"],
      ["นักเรียน ง.", "student", 1, "ม.2/1", "นักเรียนตัวอย่าง"],
      ["นักเรียน จ.", "student", 1, "ม.2/1", "นักเรียนตัวอย่าง"],
      ["นักเรียน ฉ.", "student", 1, "ม.2/1", "นักเรียนตัวอย่าง"],
      ["ครูสมพร", "teacher", 1, "ม.2/1", "ครูดนตรีตัวอย่าง · ชุมนุมดนตรีพื้นบ้าน"],
      ["นักวิจัยภาคสนาม", "collector", null, null, "ผู้ช่วยวิจัยตัวอย่าง"],
      ["ผู้เชี่ยวชาญตรวจรับรอง", "curator", null, null, "คณะผู้เชี่ยวชาญตัวอย่าง"],
      ["ผู้ประสานงานชุมชน", "community", null, null, "ตัวแทนชุมชนตัวอย่าง"],
    ];
    users.forEach(([name, role, school, cls, title], i) =>
      run("INSERT INTO users (id, name, role, school_id, class_name, title) VALUES (?, ?, ?, ?, ?, ?)", i + 1, name, role, school, cls, title),
    );

    // เครื่องดนตรี (คำอธิบายทั่วไป ให้ทีมวิจัยปรับตามข้อมูลภาคสนาม)
    const inst: [string, string, string, string, string][] = [
      ["ระนาดเอก", "ລະນາດເອກ", "Ranat ek (treble xylophone)", "เครื่องตี · ไม้", "ระนาดที่มีลูกระนาดทำจากไม้เรียงบนรางรูปเรือ ตีด้วยไม้ตีสองมือ มักเป็นผู้นำทำนองของวง"],
      ["ระนาดทุ้ม", "ລະນາດທຸ້ມ", "Ranat thum (alto xylophone)", "เครื่องตี · ไม้", "ระนาดเสียงทุ้ม บรรเลงทางที่ล้อหยอกและขัดกับทำนองหลัก"],
      ["ฆ้องวงใหญ่", "ຄ້ອງວົງໃຫຍ່", "Khong wong yai (gong circle)", "เครื่องตี · โลหะ", "ฆ้องหลายลูกเรียงบนร้านรูปวงกลม ผู้บรรเลงนั่งกลางวง บรรเลงโครงทำนองหลักของเพลง"],
      ["ปี่", "ປີ່", "Pi (quadruple-reed oboe)", "เครื่องเป่า · ลิ้น", "เครื่องเป่าที่ใช้ลิ้นทำจากใบตาล เสียงดังกังวาน ใช้เป่าทำนองเชื่อมกับเครื่องตี"],
      ["กลอง", "ກອງ", "Drums", "เครื่องหนัง", "กำหนดหน้าทับและจังหวะของเพลง"],
      ["ฉิ่ง", "ສິ່ງ", "Ching (small cymbals)", "เครื่องตี · โลหะ", "ตีบอกจังหวะ เสียงฉิ่งและฉับเป็นหลักให้ผู้บรรเลงทุกคนยึด"],
    ];
    inst.forEach(([th, lo, en, fam, desc], i) =>
      run("INSERT INTO instruments (id, name_th, name_lo, name_en, family, description) VALUES (?, ?, ?, ?, ?, ?)", i + 1, th, lo, en, fam, desc),
    );

    // ผู้ให้ข้อมูล (นามสมมติ)
    const persons: [string, string, string, string, number, string][] = [
      ["ครูภูมิปัญญา ก.", "master", "สกลนคร", "เมืองสกลนคร", 1948, "ครูภูมิปัญญาตัวอย่าง บรรเลงระนาดเอกมากว่า 50 ปี มีศิษย์หลายรุ่นในจังหวัดใกล้เคียง"],
      ["ครูภูมิปัญญา ข.", "master", "นครพนม", "ธาตุพนม", 1956, "ศิษย์รุ่นแรกของครู ก. พัฒนาทางเก็บที่ถี่ขึ้นและสอนในโรงเรียนประจำอำเภอ"],
      ["ครูภูมิปัญญา ค.", "master", "อุดรธานี", "เมืองอุดรธานี", 1960, "ศิษย์ของครู ก. เชี่ยวชาญฆ้องวงใหญ่และการเทียบเสียง"],
      ["ศิลปิน ง.", "artist", "นครพนม", "เรณูนคร", 1985, "ศิษย์ของครู ข. บรรเลงในงานบุญประจำปีของชุมชน"],
      ["ศิลปิน จ.", "artist", "หนองคาย", "ศรีเชียงใหม่", 1990, "ศิษย์ของครู ค. ร่วมเป็นผู้ช่วยสอนในโครงการ"],
      ["ครูภูมิปัญญา ฉ.", "master", "เลย", "เชียงคาน", 1944, "ครูภูมิปัญญาอีกสายหนึ่ง ขอให้เก็บรักษาข้อมูลไว้ในระดับปิด"],
    ];
    persons.forEach(([name, role, prov, dist, by, bio], i) =>
      run(
        "INSERT INTO persons (id, display_name, is_pseudonym, role, province, district, birth_year, bio, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 8, ?)",
        i + 1,
        `${name} (นามสมมติ)`,
        role,
        prov,
        dist,
        by,
        bio,
        T(120),
      ),
    );
    run("INSERT INTO lineage (teacher_id, student_id, note) VALUES (1, 2, 'เรียนที่บ้านครู ก. ราว พ.ศ. 2515'), (1, 3, 'เรียนต่อจากบิดา'), (2, 4, 'ศิษย์ในวงประจำวัด'), (3, 5, 'เรียนผ่านโครงการโรงเรียน')");

    // เพลงและทาง (ชื่อสมมติ)
    run("INSERT INTO works (id, title, genre, description) VALUES (1, 'เพลงฝึกหัดที่ 1 (ไล่เสียง)', 'แบบฝึก', 'ไล่เสียงขึ้นลงทีละเสียง ใช้ฝึกความคุ้นเคยกับลูกระนาด'), (2, 'เพลงฝึกหัดที่ 2 (ห้องคู่)', 'แบบฝึก', 'ตีโน้ตห้องละสองเสียง ฝึกการเดินมือสลับ'), (3, 'เพลงฝึกหัดที่ 3', 'เพลงสาธิต', 'เพลงสาธิตที่ครูแต่ละสายบรรเลงต่างกัน ใช้แสดงแนวคิดเรื่องทาง')");
    run("INSERT INTO variants (id, work_id, person_id, name, description) VALUES (1, 3, 1, 'ทางครู ก.', 'ทางพื้นฐาน เดินทำนองห่าง เน้นความชัดของแต่ละเสียง'), (2, 3, 2, 'ทางครู ข.', 'ทางเก็บ แทรกโน้ตซ้ำและโน้ตเชื่อมถี่ขึ้น'), (3, 3, 3, 'ทางครู ค.', 'ทางที่ใช้ฝึกฆ้องวง')");

    // ความยินยอม
    const consents: [number, number, string[], string, string, number][] = [
      [1, 2, ["TK A", "TK NC"], "voice", "การบรรเลงและสัมภาษณ์เรื่องวิธีฝึก ใช้ในสถานศึกษาได้", 100],
      [2, 1, ["TK A"], "signature", "เผยแพร่สาธารณะได้ทั้งหมด ขอให้ระบุชื่อครูทุกครั้ง", 80],
      [3, 3, ["TK A", "TK CS"], "witness", "ประวัติการสืบทอดให้ใช้ในงานวิจัยเท่านั้น", 70],
      [1, 4, ["TK CO", "TK S"], "voice", "เพลงที่ใช้ในงานบุญประจำปี ใช้ภายในชุมชนเท่านั้น", 60],
      [6, 5, ["TK SS"], "witness", "ขอให้เก็บรักษาไว้ ไม่เผยแพร่", 40],
    ];
    consents.forEach(([pid, lvl, tk, method, note, d], i) =>
      run(
        "INSERT INTO consents (id, person_id, access_level, tk_labels, method, scope_note, granted_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, 8)",
        i + 1,
        pid,
        lvl,
        JSON.stringify(tk),
        method,
        note,
        T(d),
      ),
    );

    const fullCheck = JSON.stringify({ consent: true, tuning: true, performance: true, teaching: false, interview: true, photo: true });
    const sess: [string, string, number, number, string, string, string, string, number][] = [
      ["S-2026-001", "บันทึกระนาดเอกและสัมภาษณ์ครู ก.", 1, 1, "สกลนคร", "เมืองสกลนคร", "บ้านครูภูมิปัญญา ก.", fullCheck, 100],
      ["S-2026-002", "ทางเก็บของครู ข.", 2, 2, "นครพนม", "ธาตุพนม", "ศาลาวัดประจำหมู่บ้าน", JSON.stringify({ consent: true, tuning: false, performance: true, teaching: false, interview: true, photo: false }), 80],
      ["S-2026-003", "ประวัติการสืบทอดสายครู ค.", 3, 3, "อุดรธานี", "เมืองอุดรธานี", "บ้านครูภูมิปัญญา ค.", JSON.stringify({ consent: true, tuning: false, performance: true, teaching: false, interview: true, photo: false }), 70],
      ["S-2026-004", "เพลงในงานบุญประจำปี", 1, 4, "สกลนคร", "เมืองสกลนคร", "ลานวัดประจำหมู่บ้าน", JSON.stringify({ consent: true, interview: true }), 60],
      ["S-2026-005", "บันทึกครู ฉ. (เก็บรักษา)", 6, 5, "เลย", "เชียงคาน", "บ้านครูภูมิปัญญา ฉ.", JSON.stringify({ consent: true, interview: true }), 40],
    ];
    sess.forEach(([code, title, pid, cid, prov, dist, place, check, d], i) =>
      run(
        "INSERT INTO sessions (id, code, title, person_id, consent_id, province, district, place, recorded_on, collector_id, checklist, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 8, ?, 'submitted', ?)",
        i + 1,
        code,
        title,
        pid,
        cid,
        prov,
        dist,
        place,
        T(d).slice(0, 10),
        check,
        T(d),
      ),
    );

    // เสียงสังเคราะห์: วงครู ก. มีระบบเสียงของตัวเอง (ค่าเพี้ยนจาก 7 เสียงเท่า หน่วย cents)
    const devKor = [0, 9, -14, 6, -5, 12, -8];
    const devKhor = [0, -6, 10, -4, 8, -10, 5];

    const insSeg = (
      sessionId: number,
      assetId: number | null,
      kind: string,
      startMs: number | null,
      endMs: number | null,
      workId: number | null,
      variantId: number | null,
      instrumentId: number | null,
      notation: string | null,
      transcript: string | null,
      ai: unknown,
      conf: number | null,
      status: string,
      daysAgo: number,
    ) =>
      run(
        "INSERT INTO segments (session_id, asset_id, kind, start_ms, end_ms, work_id, variant_id, instrument_id, notation, transcript, ai_suggestion, ai_confidence, status, reviewed_by, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        sessionId,
        assetId,
        kind,
        startMs,
        endMs,
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

    // S1: การบรรเลงทางครู ก. + ตีไล่เสียง + สัมภาษณ์
    const p1 = addAudio(1, "ranat-ek-tang-kor.wav", synthNotation(NT.tangKor, { baseHz: 280, devCents: devKor, slotSec: 0.4, humanize: 0.008 }), "performance", "ไมค์ 1 ระนาดเอก", 1, 100);
    const segPerf1 = insSeg(1, p1.assetId, "performance", 0, Math.round((p1.analysis?.durationSec ?? 0) * 1000), 3, 1, 1, NT.tangKor, null, p1.analysis, p1.analysis?.confidence ?? null, "approved", 98);
    const t1 = addAudio(1, "ranat-ek-tuning.wav", synthTuningSweep(280, devKor), "tuning", "ไมค์ 1 ระนาดเอก (ตีไล่เสียง)", 1, 100);
    const segTune1 = insSeg(1, t1.assetId, "tuning", 0, Math.round((t1.analysis?.durationSec ?? 0) * 1000), null, null, 1, null, null, t1.analysis, t1.analysis?.confidence ?? null, "approved", 98);
    run("INSERT INTO tunings (segment_id, instrument_id, person_id, base_hz, steps, created_at) VALUES (?, 1, 1, ?, ?, ?)", segTune1, t1.analysis!.tuning!.baseHz, JSON.stringify(t1.analysis!.tuning!.steps), T(96));
    const segInt1 = insSeg(
      1,
      null,
      "interview",
      null,
      null,
      null,
      null,
      null,
      null,
      "(บทสัมภาษณ์ตัวอย่าง) ตอนเริ่มหัด ครูให้ตีไล่เสียงช้า ๆ ทุกวันก่อนจะต่อเพลง ต้องตีให้ได้ยินเสียงแต่ละลูกชัดก่อน ค่อยเร่งความเร็ว.  เวลาฝึกให้ฟังเสียงฉิ่งเป็นหลัก ฉิ่งกับฉับจะบอกว่าเราอยู่ตรงไหนของห้อง ถ้าหลงให้รอฟังฉับแล้วเข้าใหม่.  จับไม้ตีให้หลวม ๆ ข้อมืออย่าเกร็ง ถ้าเกร็งเสียงจะแข็งและตีได้ไม่นาน.  ท่อนที่โน้ตติดกันสามตัว เช่น ม ซ ล ให้ฝึกแยกท่อนนั้นช้า ๆ ก่อน แล้วค่อยต่อกับห้องก่อนหน้าและห้องถัดไป.  ทางของครูจะเดินทำนองห่าง ให้เด็กได้ยินโครงเพลงก่อน พอคล่องแล้วค่อยเรียนทางเก็บ.",
      null,
      null,
      "approved",
      98,
    );

    // S2: ทางครู ข. — รอตรวจ (AI เสนอโน้ต)
    const p2 = addAudio(2, "ranat-ek-tang-khor.wav", synthNotation(NT.tangKhor, { baseHz: 292, devCents: devKhor, slotSec: 0.36, humanize: 0.012 }), "performance", "ไมค์ 1 ระนาดเอก", 1, 80);
    insSeg(2, p2.assetId, "performance", 0, Math.round((p2.analysis?.durationSec ?? 0) * 1000), 3, 2, 1, null, null, p2.analysis, p2.analysis?.confidence ?? null, "pending", 79);
    const segInt2 = insSeg(
      2,
      null,
      "interview",
      null,
      null,
      null,
      null,
      null,
      null,
      "(บทสัมภาษณ์ตัวอย่าง) ทางของผมเรียนมาจากครู ก. แต่มาปรับให้เก็บถี่ขึ้น คือแทรกโน้ตซ้ำและโน้ตเชื่อมเข้าไประหว่างเสียงหลัก.  ถ้าฟังทางครู ก. จะได้ยินทำนองห่าง ๆ ส่วนทางของผมจะพรมโน้ตมากกว่า เวลาสอนเด็กให้เรียนทางครู ก. ให้คล่องก่อน.  ทางเก็บต้องใช้มือซ้ายขวาสลับกันเร็ว ฝึกห้องละสองโน้ตให้มือเดินคล่องก่อน.",
      null,
      null,
      "approved",
      78,
    );

    // S3: ประวัติการสืบทอด (ระดับนักวิจัย) + การบรรเลงคุณภาพเสียงต่ำ รอตรวจ
    const p3 = addAudio(3, "khong-wong-field.wav", synthNotation(NT.tangKhor3, { baseHz: 270, slotSec: 0.43, noise: 0.06, humanize: 0.035 }), "performance", "ไมค์รวม (มีเสียงรบกวน)", 3, 70);
    insSeg(3, p3.assetId, "performance", 0, Math.round((p3.analysis?.durationSec ?? 0) * 1000), 3, 3, 3, null, null, p3.analysis, p3.analysis?.confidence ?? null, "pending", 69);
    const segInt3 = insSeg(
      3,
      null,
      "interview",
      null,
      null,
      null,
      null,
      null,
      null,
      "(บทสัมภาษณ์ตัวอย่าง) ผมเริ่มเรียนกับครู ก. ตอนอายุราว 15 ปี ที่บ้านครูในตัวเมืองสกลนคร เรียนพร้อมกับครู ข. ซึ่งเป็นรุ่นพี่.  ครู ก. ให้ผมเน้นฆ้องวงใหญ่ เพราะต้องจำโครงเพลงให้แม่นก่อนเครื่องอื่น และสอนวิธีเทียบเสียงฆ้องด้วยการถ่วงตะกั่ว.  ผมมีศิษย์ที่ยังเล่นอยู่สามคน คนที่สอนต่อในโรงเรียนคือศิลปิน จ. ที่หนองคาย.",
      null,
      null,
      "approved",
      68,
    );

    // S4: เพลงในงานบุญ (ชุมชนเท่านั้น)
    const segInt4 = insSeg(
      4,
      null,
      "interview",
      null,
      null,
      null,
      null,
      null,
      null,
      "(บทสัมภาษณ์ตัวอย่าง) เพลงชุดนี้ใช้บรรเลงในงานบุญประจำปีของหมู่บ้านเท่านั้น ก่อนบรรเลงต้องมีการไหว้ครูตามธรรมเนียม.  ไม่ควรนำไปบรรเลงนอกงานหรือเพื่อความบันเทิง คนในชุมชนจะเรียนจากผู้อาวุโสระหว่างเตรียมงาน.",
      null,
      null,
      "approved",
      58,
    );

    // S5: ระดับปิด — ไม่เข้าดัชนี
    insSeg(5, null, "interview", null, null, null, null, null, null, "(บทสัมภาษณ์ตัวอย่าง) ข้อมูลที่ครูขอให้เก็บรักษาไว้ ไม่เผยแพร่", null, null, "approved", 38);

    [segPerf1, segTune1, segInt1, segInt2, segInt3, segInt4].forEach((id) => indexSegment(id));

    // เอกสารความรู้ทั่วไป (สาธารณะ)
    addDoc(
      "การอ่านโน้ตตัวเลขไทย",
      "โน้ตที่ใช้ในแพลตฟอร์มเขียนด้วยอักษร ด ร ม ฟ ซ ล ท แทนเสียงทั้ง 7 เสียง แบ่งเป็นห้อง ห้องละ 4 ช่อง คั่นด้วยเส้น | เครื่องหมาย - หมายถึงช่องที่ไม่ตีเสียงใหม่ (เว้นหรือปล่อยเสียงเดิมก้องต่อ). โน้ตที่มีจุดด้านบน เช่น ดํ คือเสียงสูงขึ้นหนึ่งช่วงทบ. เสียงในช่องสุดท้ายของห้องมักตรงกับจังหวะหนัก (ฉับ) จึงควรนับ 1-2-3-4 และให้เสียงที่ 4 ลงพร้อมฉับ.",
      "เอกสารประกอบการเรียน Pinphat AI",
    );
    addDoc(
      "ระบบเสียง 7 เสียงและการวัดเสียงจริงของวง",
      "ดนตรีไทยและลาวแบบดั้งเดิมมักอธิบายว่าแบ่งหนึ่งช่วงทบเป็น 7 เสียงที่ห่างเท่ากันโดยประมาณ คือราว 171 cents ต่อขั้น ซึ่งต่างจากระบบ 12 เสียงของดนตรีตะวันตก. ในความเป็นจริงระนาดและฆ้องของแต่ละวงเทียบเสียงไม่เหมือนกัน เสียงแต่ละลูกจึงคลาดจากค่าทฤษฎีได้หลายสิบ cents. โครงการนี้บันทึกการตีไล่เสียงทีละลูกของแต่ละวง แล้ววัดค่าความถี่จริงเพื่อเก็บเป็นข้อมูลระบบเสียงของแต่ละสาย.",
      "เอกสารประกอบการเรียน Pinphat AI",
    );
    addDoc(
      "เกี่ยวกับ Pinphat AI",
      "Pinphat AI เป็นแพลตฟอร์มต้นแบบเพื่อการอนุรักษ์ ถ่ายทอด และส่งเสริมการเรียนรู้ดนตรีพิณพาทย์ล้านช้าง สำหรับสถานศึกษาในกลุ่มจังหวัดอีสานตอนเหนือ. ความรู้ทุกชิ้นมาจากครูภูมิปัญญาที่ให้ความยินยอม และผ่านการตรวจรับรองโดยผู้เชี่ยวชาญ. ครูผู้ช่วย AI ตอบจากคลังความรู้นี้เท่านั้นและอ้างอิงแหล่งที่มาทุกครั้ง ข้อมูลในเวอร์ชันสาธิตนี้เป็นข้อมูลสมมติ.",
      "Pinphat AI",
    );
    inst.forEach(([th, lo, en, fam, desc]) => addDoc(`${th} (${lo})`, `${th} หรือในภาษาลาวเรียก ${lo} (${en}) จัดเป็น${fam}. ${desc}.`, "ทะเบียนเครื่องดนตรี Pinphat AI"));

    // บทเรียน
    const lessons: [string, string, string, string, number | null, string, number, number, number | null][] = [
      ["ไล่เสียง 7 เสียง", "ป.4 ถึง ม.3", "ศ 2.1 ม.1/1", "ฝึกตีไล่เสียงขึ้นลงช้า ๆ ให้แต่ละเสียงชัด", null, NT.scale, 160, 1, null],
      ["ห้องคู่ เดินมือสลับ", "ม.1 ถึง ม.3", "ศ 2.1 ม.2/1", "ฝึกตีห้องละสองเสียง สลับมือซ้ายขวา", null, NT.pairs, 150, 1, null],
      ["เพลงฝึกหัดที่ 3 · ทางครู ก.", "ม.2 ถึง ม.6", "ศ 2.2 ม.2/1", "เพลงสาธิตทางพื้นฐานจากครูภูมิปัญญา ก. มีท่อนโน้ตติดกันสามตัว", segPerf1, NT.tangKor, 150, 2, 280],
    ];
    lessons.forEach(([title, grade, ind, desc, seg, nt, tempo, diff, base], i) =>
      run(
        "INSERT INTO lessons (id, title, grade, indicator, description, segment_id, instrument_id, notation, tempo, difficulty, base_hz, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 7, ?)",
        i + 1,
        title,
        grade,
        ind,
        desc,
        seg,
        nt,
        tempo,
        diff,
        base,
        T(50),
      ),
    );
    run("INSERT INTO assignments (teacher_id, lesson_id, class_name, due_on, created_at) VALUES (7, 3, 'ม.2/1', ?, ?), (7, 2, 'ม.2/1', ?, ?)", T(-7).slice(0, 10), T(5), T(3).slice(0, 10), T(14));

    // ประวัติการฝึก (ตัวอย่าง) ให้แดชบอร์ดครูมีข้อมูล
    const profile: [number, number, number[]][] = [
      [1, 0.9, [5]],
      [2, 0.62, [5, 6, 9]],
      [3, 0.86, [11]],
      [4, 0.74, [5, 13]],
      [5, 0.55, [2, 5, 6, 10]],
      [6, 0.94, []],
    ];
    let seedN = 3;
    const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
    profile.forEach(([uid, acc, weak]) => {
      for (let k = 0; k < 6; k++) {
        const lesson = k < 2 ? 1 : k < 4 ? 2 : 3;
        const a = Math.min(1, Math.max(0.2, acc - 0.12 + k * 0.03 + (rnd() - 0.5) * 0.08));
        const errs = lesson === 3 ? weak.filter(() => rnd() > 0.3) : rnd() > 0.6 ? [Math.floor(rnd() * 8)] : [];
        run(
          "INSERT INTO practice_attempts (user_id, lesson_id, mode, speed, accuracy, timing_ms, bar_errors, created_at) VALUES (?, ?, 'keys', ?, ?, ?, ?, ?)",
          uid,
          lesson,
          k < 3 ? 0.75 : 1,
          Math.round(a * 100) / 100,
          Math.round(40 + (1 - a) * 120 + rnd() * 20),
          JSON.stringify(errs),
          T(20 - k * 3 + rnd()),
        );
      }
    });

    run("INSERT INTO audit_log (user_id, action, target, detail, at) VALUES (0, 'seed', 'database', 'สร้างข้อมูลตัวอย่างสำหรับสาธิตระบบ', ?)", T(0));
  });
}
