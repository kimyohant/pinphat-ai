"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { th as TH } from "@/lib/i18n/th";
import { Icon } from "@/components/ui/Icon";

type Source = { n: number; title: string; citation: string; level: number; levelName: string; sourceType: string; sourceId: number | null };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; mode?: string; status?: string; flagged?: boolean };

// คลังบันทึกเป็นภาษาไทย ปุ่มแนะนำจึงแสดงตามภาษาที่เลือก แต่ส่งคำถามภาษาไทยไปค้น
const SUGGEST = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

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
  const { t: T, locale } = useT();
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
      update((m) => ({ ...m, content: T.tutor.offline }));
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
          <span className="small muted">{T.tutor.suggestions}</span>
          <div className="row">
            {SUGGEST.map((k) => (
              <button key={k} className="btn ghost sm" onClick={() => ask(TH.tutor[k])}>
                {T.tutor[k]}
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
              {m.content ? withCites(m.content, m.sources) : <span className="muted">{m.status ?? T.tutor.searching}</span>}
              {m.sources && m.sources.length > 0 && (
                <div className="sources">
                  {m.sources.map((s) => (
                    <div key={s.n} id={`src-${s.n}`} className="source">
                      <span className="n">[{s.n}]</span>
                      <span>
                        <b>{s.title}</b> <span className={`badge l${s.level}`}>{T.levels[s.level as 1 | 2 | 3 | 4 | 5] ?? s.levelName}</span>
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
                  <span>{m.mode === "llm" ? T.tutor.modeLlm : m.mode === "retrieval" ? T.tutor.modeRetrieval : T.tutor.modeNone}</span>
                  {m.flagged ? (
                    <span className="badge ok">{T.tutor.flagged}</span>
                  ) : (
                    <button className="btn ghost sm" onClick={() => flag(i)}>
                      {T.tutor.flag}
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
          placeholder={T.tutor.placeholder}
          style={{ flex: 1, width: "auto" }}
          aria-label={T.tutor.question}
        />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>
          <Icon name="arrow" size={16} />
          {T.tutor.ask}
        </button>
      </form>
    </div>
  );
}
