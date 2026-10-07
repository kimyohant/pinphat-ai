"use client";
import { useEffect, useState } from "react";
import type { MediaJob } from "@/lib/studio";
import { attachToLesson } from "@/app/studio/actions";

type Lesson = { id: number; title: string };

const STATUS: Record<MediaJob["status"], [string, string]> = {
  queued: ["รอคิว GPU", ""],
  loading: ["กำลังโหลดโมเดล", "l2"],
  running: ["กำลังสร้าง", "warn"],
  done: ["เสร็จแล้ว", "ok"],
  failed: ["ไม่สำเร็จ", "crit"],
};

const IDEAS = {
  image: ["ระนาดเอกวางบนศาลาไม้ในวัดอีสาน แสงเช้า", "มือนักเรียนจับไม้ตีระนาดอย่างถูกวิธี มุมใกล้", "วงพิณพาทย์ครบวงในห้องเรียนดนตรี มองจากด้านบน"],
  video: ["มือตีระนาดเอกช้า ๆ กล้องเลื่อนจากซ้ายไปขวา", "ฆ้องวงใหญ่วางเป็นวงกลม กล้องหมุนรอบช้า ๆ"],
};

export function StudioClient({ lessons, initialJobs, enabled }: { lessons: Lesson[]; initialJobs: MediaJob[]; enabled: boolean }) {
  const [kind, setKind] = useState<"image" | "video">("image");
  const [th, setTh] = useState("");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x768");
  const [seconds, setSeconds] = useState(3);
  const [lessonId, setLessonId] = useState("");
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState<"" | "prompt" | "submit">("");
  const [msg, setMsg] = useState<{ t: string; kind: "ok" | "crit" } | null>(null);

  const pending = jobs.some((j) => j.status === "queued" || j.status === "loading" || j.status === "running");

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const r = await fetch("/api/studio/jobs");
      if (r.ok) setJobs(((await r.json()) as { jobs: MediaJob[] }).jobs);
    }, 4000);
    return () => clearInterval(t);
  }, [pending]);

  function pickKind(k: "image" | "video") {
    setKind(k);
    setSize(k === "video" ? "1280x704" : "1024x768");
  }

  async function draft() {
    setBusy("prompt");
    setMsg(null);
    try {
      const r = await fetch("/api/studio/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: th, kind }) });
      const j = (await r.json()) as { prompt?: string; error?: string };
      if (j.prompt) setPrompt(j.prompt);
      else setMsg({ t: j.error ?? "สร้าง prompt ไม่สำเร็จ", kind: "crit" });
    } catch {
      setMsg({ t: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", kind: "crit" });
    } finally {
      setBusy("");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("submit");
    setMsg(null);
    try {
      const r = await fetch("/api/studio/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, promptTh: th, prompt, size, seconds, lessonId: lessonId ? Number(lessonId) : null }),
      });
      const j = (await r.json()) as { id?: number; error?: string };
      if (!r.ok) setMsg({ t: j.error ?? "ส่งงานไม่สำเร็จ", kind: "crit" });
      else {
        setMsg({ t: kind === "video" ? "ส่งงานแล้ว วิดีโอใช้เวลาสร้างราว 10–15 นาที ปิดหน้านี้ได้ งานจะทำต่อบนเซิร์ฟเวอร์" : "ส่งงานแล้ว รูปจะเสร็จในราว 20 วินาทีถึง 1 นาที", kind: "ok" });
        const l = await fetch("/api/studio/jobs");
        if (l.ok) setJobs(((await l.json()) as { jobs: MediaJob[] }).jobs);
      }
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="split">
      <div className="stack-lg">
        <section className="stack">
          <h2>ผลงาน</h2>
          {jobs.length === 0 && <div className="empty">ยังไม่มีสื่อที่สร้าง ลองสร้างรูปแรกจากแบบฟอร์มด้านขวา</div>}
          <div className="grid cols-2">
            {jobs.map((j) => (
              <article key={j.id} className="card">
                <div className="row between">
                  <span className="row">
                    <span className="badge ind">{j.kind === "video" ? "วิดีโอ" : "รูปภาพ"}</span>
                    <span className={`badge ${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
                  </span>
                  <span className="mono xs muted">#{j.id}</span>
                </div>
                {j.status === "done" && j.kind === "image" && (
                  <figure style={{ margin: 0, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/studio/file/${j.id}`} alt={j.prompt_th || j.prompt} style={{ width: "100%", borderRadius: 8, display: "block" }} />
                    <span className="badge warn" style={{ position: "absolute", top: 8, left: 8 }}>
                      สร้างโดย AI
                    </span>
                  </figure>
                )}
                {j.status === "done" && j.kind === "video" && (
                  <figure style={{ margin: 0, position: "relative" }}>
                    <video src={`/api/studio/file/${j.id}`} controls playsInline style={{ width: "100%", borderRadius: 8, display: "block" }} />
                    <span className="badge warn" style={{ position: "absolute", top: 8, left: 8 }}>
                      สร้างโดย AI
                    </span>
                  </figure>
                )}
                {(j.status === "running" || j.status === "loading" || j.status === "queued") && (
                  <div className="stack">
                    <div style={{ height: 8, borderRadius: 99, background: "var(--sunk)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, j.progress)}%`, height: "100%", background: "var(--bronze)", transition: "width .4s" }} />
                    </div>
                    <span className="xs muted">
                      {j.status === "loading" ? "กำลังสลับโมเดลบน GPU" : j.status === "queued" ? "รองานก่อนหน้าบน GPU" : `${j.progress}%`}
                    </span>
                  </div>
                )}
                {j.status === "failed" && <p className="small" style={{ color: "var(--crit)" }}>{j.error}</p>}
                {j.prompt_th && <p className="small">{j.prompt_th}</p>}
                <details className="xs muted">
                  <summary>prompt ที่ใช้</summary>
                  {j.prompt}
                </details>
                <span className="xs muted">
                  {j.size}
                  {j.kind === "video" ? ` · ${j.seconds} วินาที` : ""} · {j.creator}
                </span>
                {j.status === "done" && (
                  <form action={attachToLesson} className="row">
                    <input type="hidden" name="jobId" value={j.id} />
                    <select name="lessonId" defaultValue={j.lesson_id ?? ""} aria-label="แนบกับบทเรียน" style={{ flex: 1, width: "auto" }}>
                      <option value="">— ไม่แนบกับบทเรียน —</option>
                      {lessons.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </select>
                    <button className="btn ghost sm" type="submit">
                      บันทึก
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      <aside className="stack-lg">
        <form className="card stack" onSubmit={submit}>
          <h3>สร้างสื่อใหม่</h3>
          {!enabled && <div className="notice warn small">ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ Unsloth ใน .env.local</div>}
          <div className="row">
            <button type="button" className={`btn sm ${kind === "image" ? "" : "ghost"}`} onClick={() => pickKind("image")}>
              รูปภาพ
            </button>
            <button type="button" className={`btn sm ${kind === "video" ? "" : "ghost"}`} onClick={() => pickKind("video")}>
              วิดีโอสั้น
            </button>
          </div>
          <label>
            อธิบายสิ่งที่ต้องการ (ภาษาไทย)
            <textarea id="studio-th" value={th} onChange={(e) => setTh(e.target.value)} style={{ minHeight: 90 }} placeholder={IDEAS[kind][0]} />
          </label>
          <div className="row">
            {IDEAS[kind].map((i) => (
              <button key={i} type="button" className="btn ghost sm" style={{ whiteSpace: "normal", textAlign: "left" }} onClick={() => setTh(i)}>
                {i}
              </button>
            ))}
          </div>
          <button type="button" className="btn ghost" onClick={draft} disabled={!th.trim() || busy !== "" || !enabled}>
            {busy === "prompt" ? "AI กำลังเขียน prompt…" : "ให้ AI เขียน prompt ภาษาอังกฤษ"}
          </button>
          <label>
            Prompt (ภาษาอังกฤษ)
            <textarea id="studio-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ minHeight: 110 }} required />
            <span className="hint">โมเดลรูปและวิดีโอเข้าใจภาษาอังกฤษดีที่สุด แก้ไขได้ก่อนส่ง</span>
          </label>
          <div className="grid cols-2">
            <label>
              ขนาด
              <select id="studio-size" value={size} onChange={(e) => setSize(e.target.value)}>
                {(kind === "video" ? ["1280x704", "704x1280"] : ["1024x768", "768x1024", "1024x1024", "1280x720"]).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {kind === "video" && (
              <label>
                ความยาว (วินาที)
                <input id="studio-sec" type="number" min={1} max={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
              </label>
            )}
          </div>
          <label>
            แนบกับบทเรียน
            <select id="studio-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">— ภายหลัง —</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <button className="btn alt" type="submit" disabled={busy !== "" || !prompt.trim() || !enabled}>
            {kind === "video" ? "สร้างวิดีโอ" : "สร้างรูป"}
          </button>
          {msg && <div className={`notice small ${msg.kind}`}>{msg.t}</div>}
        </form>
        <section className="card small">
          <h3>ข้อควรระวัง</h3>
          <ul style={{ margin: 0, paddingLeft: "1.1em", display: "grid", gap: 4 }}>
            <li>สื่อจาก AI เป็นภาพประกอบเท่านั้น รายละเอียดเครื่องดนตรีอาจไม่ตรงของจริง ใช้สอนวิธีบรรเลงไม่ได้</li>
            <li>ไม่เข้าคลังความรู้และไม่ถูกใช้ตอบคำถามของครูผู้ช่วย AI</li>
            <li>ห้ามสร้างภาพเลียนแบบครูภูมิปัญญาที่มีตัวตนจริง หรือพิธีกรรมที่ชุมชนจำกัดการเผยแพร่</li>
            <li>เซิร์ฟเวอร์มี GPU ชุดเดียว งานจะทำทีละชิ้น ระหว่างสร้างวิดีโอ ครูผู้ช่วย AI จะตอบแบบค้นคืนจากคลังแทน</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
