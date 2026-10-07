"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";

type Source = { n: number; title: string; citation: string; level: number; levelName: string; sourceType: string; sourceId: number | null };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; mode?: string; status?: string; flagged?: boolean };

const SUGGEST = [
  "ควรเริ่มฝึกระนาดอย่างไร",
  "ทางของครู ข. ต่างจากทางครู ก. อย่างไร",
  "อ่านโน้ตตัวเลขไทยอย่างไร",
  "ครู ค. เรียนดนตรีกับใคร",
  "ระนาดของวงครู ก. เทียบเสียงต่างจาก 7 เสียงเท่าอย่างไร",
  "เพลงในงานบุญประจำปีใช้อย่างไร",
];

function withCites(text: string, sources: Source[] = []) {
  return text.split(/(\[\d+\])/g).map((p, i) => {
    const m = p.match(/^\[(\d+)\]$/);
    if (m && sources.some((s) => s.n === Number(m[1])))
      return (
        <sup key={i}>
          <a href={`#src-${m[1]}`}>{m[1]}</a>
        </sup>
      );
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function TutorChat({ initial }: { initial?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    // ต้องไม่คืนค่าจาก effect: scrollIntoView ในเบราว์เซอร์รุ่นใหม่คืนค่าเป็น Promise
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const history: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    const update = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
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
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; sources?: Source[]; mode?: string };
          if (ev.type === "sources") update((m) => ({ ...m, sources: ev.sources }));
          if (ev.type === "status") update((m) => ({ ...m, status: ev.text }));
          if (ev.type === "text") update((m) => ({ ...m, status: undefined, content: m.content + (ev.text ?? "") }));
          if (ev.type === "done") update((m) => ({ ...m, mode: ev.mode }));
        }
      }
    } catch {
      update((m) => ({ ...m, content: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองอีกครั้ง" }));
    } finally {
      setBusy(false);
    }
  }

  async function flag(i: number) {
    const res = await fetch("/api/tutor/flag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: msgs[i - 1]?.content ?? "", answer: msgs[i].content }),
    });
    if (res.ok) setMsgs((all) => all.map((m, k) => (k === i ? { ...m, flagged: true } : m)));
  }

  useEffect(() => {
    // ถามอัตโนมัติครั้งเดียว เมื่อเปิดหน้าจากลิงก์ที่มีคำถามแนบมา
    if (initial && !asked.current) {
      asked.current = true;
      void ask(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="stack-lg">
      {msgs.length === 0 && (
        <div className="stack">
          <span className="small muted">ลองถาม</span>
          <div className="row">
            {SUGGEST.map((s) => (
              <button key={s} className="btn ghost sm" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="chat" aria-live="polite">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">
              {m.content}
            </div>
          ) : (
            <div key={i} className="msg ai">
              {m.content ? withCites(m.content, m.sources) : <span className="muted">{m.status ?? "กำลังค้นคลังความรู้…"}</span>}
              {m.sources && m.sources.length > 0 && (
                <div className="sources">
                  {m.sources.map((s) => (
                    <div key={s.n} id={`src-${s.n}`} className="source">
                      <span className="n">[{s.n}]</span>
                      <span>
                        <b>{s.title}</b> <span className={`badge l${s.level}`}>{s.levelName}</span>
                        <br />
                        <span className="muted">
                          {s.sourceType === "segment" ? <Link href={`/archive#seg-${s.sourceId}`}>{s.citation}</Link> : s.citation}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {m.mode && (
                <div className="row xs muted" style={{ marginTop: 8 }}>
                  <span>{m.mode === "llm" ? "ตอบโดย LLM จากแหล่งข้างต้น" : m.mode === "retrieval" ? "ข้อความจากคลังโดยตรง" : "ไม่พบแหล่งข้อมูล"}</span>
                  {m.flagged ? (
                    <span className="badge ok">ส่งให้ผู้เชี่ยวชาญตรวจแล้ว</span>
                  ) : (
                    <button className="btn ghost sm" onClick={() => flag(i)}>
                      แจ้งคำตอบผิด
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          id="tutor-q"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="พิมพ์คำถาม เช่น ควรจับไม้ตีอย่างไร"
          style={{ flex: 1, width: "auto" }}
          aria-label="คำถาม"
        />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>
          ถาม
        </button>
      </form>
    </div>
  );
}
