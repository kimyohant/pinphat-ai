"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { th as TH } from "@/lib/i18n/th";
import { TUTOR_UI } from "@/lib/i18n/tutor-ui";
import { Icon } from "@/components/ui/Icon";
import { GongOrb, type OrbState } from "@/components/tutor/GongOrb";

type Source = { n: number; title: string; citation: string; level: number; levelName: string; sourceType: string; sourceId: number | null };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; mode?: string; status?: string; flagged?: boolean };
export type TutorMeta = { levels: { level: number; name: string }[]; role: string; model: string | null };

// คลังบันทึกเป็นภาษาไทย ปุ่มแนะนำจึงแสดงตามภาษาที่เลือก แต่ส่งคำถามภาษาไทยไปค้น
const SUGGEST = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

export function TutorChat({ initial, meta }: { initial?: string; meta: TutorMeta }) {
  const { t: T, locale } = useT();
  const U = TUTOR_UI[locale];
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ msg: number; n: number } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    // เลื่อนกล่องสนทนาเอง ไม่เลื่อนทั้งหน้า: บนมือถือหน้าทั้งหน้าเลื่อนแล้วช่องพิมพ์หลุดจากจอ
    // หน้าเริ่มต้นไม่เลื่อน ไม่อย่างนั้นวงฆ้องด้านบนหลุดจากกรอบตั้งแต่เปิดหน้า
    const el = scrollRef.current;
    if (el && msgs.length) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    // ช่องพิมพ์ขยายตามข้อความ สูงสุดราว 5 บรรทัด
    const el = boxRef.current;
    if (!el) return;
    // ว่างอยู่ให้สูงบรรทัดเดียวเสมอ: ข้อความตัวอย่างที่ตัดบรรทัดบนมือถือทำให้ช่องสูงเกินจริง
    if (!input) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [input]);

  const last = msgs.at(-1);
  const lastAnswer = [...msgs].reverse().find((m) => m.role === "assistant");
  const nSources = lastAnswer?.sources?.length ?? 0;

  const state: OrbState = useMemo(() => {
    if (busy && last?.role === "assistant") {
      if (last.content) return last.sources?.length ? "speaking" : "empty";
      return last.sources ? (last.sources.length ? "found" : "empty") : "searching";
    }
    if (input.trim()) return "typing";
    return "idle";
  }, [busy, last, input]);

  const phase =
    state === "searching"
      ? (last?.status ?? U.phaseSearching)
      : state === "found"
        ? (last?.status ?? fmt(U.phaseFound, { n: nSources }))
        : state === "speaking"
          ? U.phaseSpeaking
          : state === "empty"
            ? U.phaseEmpty
            : state === "typing"
              ? U.phaseTyping
              : lastAnswer?.mode
                ? lastAnswer.mode === "none"
                  ? U.phaseEmpty
                  : fmt(U.phaseDone, { n: nSources })
                : U.phaseIdle;

  // แผงแหล่งที่มาด้านข้าง: คำตอบที่ผู้ใช้กดเลขอ้างอิงล่าสุด หรือคำตอบล่าสุด
  const panelIndex = active?.msg ?? msgs.findLastIndex((m) => m.role === "assistant" && m.sources?.length);
  const panelSources = panelIndex >= 0 ? (msgs[panelIndex]?.sources ?? []) : [];

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setActive(null);
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
      boxRef.current?.focus();
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

  async function copy(i: number) {
    try {
      await navigator.clipboard.writeText(msgs[i].content);
      setCopied(i);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // บางเบราว์เซอร์ไม่ให้เข้าคลิปบอร์ดนอก https เงียบไว้ดีกว่าแจ้งข้อผิดพลาดที่ผู้ใช้แก้ไม่ได้
    }
  }

  function pick(msg: number, n: number) {
    setActive({ msg, n });
    // บนจอกว้างการ์ดอยู่ในแผงด้านข้าง บนมือถืออยู่ใต้คำตอบ เลื่อนหาตัวที่มองเห็นได้
    requestAnimationFrame(() => {
      const el = [...document.querySelectorAll<HTMLElement>(`[data-src="${msg}-${n}"]`)].find((e) => e.offsetParent !== null);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }

  function withCites(text: string, i: number, sources: Source[] = []) {
    return text.split(/(\[\d+\])/g).map((p, k) => {
      const m = p.match(/^\[(\d+)\]$/);
      if (m && sources.some((s) => s.n === Number(m[1])))
        return (
          <button key={k} type="button" className={`cite${active?.msg === i && active.n === Number(m[1]) ? " on" : ""}`} onClick={() => pick(i, Number(m[1]))} aria-label={`${U.sources} ${m[1]}`}>
            {m[1]}
          </button>
        );
      return <Fragment key={k}>{p}</Fragment>;
    });
  }

  // ฟังก์ชันเรนเดอร์ ไม่ใช่คอมโพเนนต์ซ้อน: คอมโพเนนต์ที่ประกาศในฟังก์ชันจะถูกสร้างใหม่ทุกคำที่ไหลเข้ามาและการ์ดจะกะพริบ
  function sourceCard(s: Source, msg: number) {
    const on = active?.msg === msg && active.n === s.n;
    return (
      <div key={s.n} className={`src${on ? " on" : ""}`} data-src={`${msg}-${s.n}`}>
        <span className="src-n">{s.n}</span>
        <div className="src-body">
          <b>{s.title}</b>
          <span className="src-cite">
            {s.sourceType === "segment" ? (
              <Link href={`/archive#seg-${s.sourceId}`}>
                {s.citation} <Icon name="arrow" size={12} />
              </Link>
            ) : (
              s.citation
            )}
          </span>
        </div>
        <span className={`src-lv l${s.level}`}>L{s.level}</span>
      </div>
    );
  }

  useEffect(() => {
    // ถามอัตโนมัติครั้งเดียว เมื่อเปิดหน้าจากลิงก์ที่มีคำถามแนบมา
    if (initial && !asked.current) {
      asked.current = true;
      void ask(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const empty = msgs.length === 0;

  return (
    <section className={`stage${empty ? " is-empty" : ""}`} aria-label={T.tutor.eyebrow}>
      <div className="stage-bg" aria-hidden="true" />

      <header className="stage-top">
        <div className="stage-id">
          {!empty && <GongOrb state={state} lit={nSources} size={44} />}
          <div className="stage-id-text">
            <span className="stage-eyebrow">{T.tutor.eyebrow}</span>
            <span className="phase" data-state={state} aria-live="polite">
              <i className="phase-dot" aria-hidden="true" />
              {phase}
            </span>
          </div>
        </div>
        <div className="stage-chips">
          <span className="chip" title={meta.levels.map((l) => `L${l.level} · ${l.name}`).join(", ")}>
            <Icon name="shield" size={14} />
            {U.access}: {meta.levels.map((l) => `L${l.level}`).join(" ")}
          </span>
          <span className="chip">
            <Icon name="spark" size={14} />
            {meta.model ?? U.retrievalBadge}
          </span>
          {!empty && (
            <button type="button" className="chip chip-btn" onClick={() => !busy && (setMsgs([]), setActive(null))} disabled={busy}>
              <Icon name="close" size={14} />
              {U.newChat}
            </button>
          )}
        </div>
      </header>

      <div className="stage-body">
        <div className="stage-scroll" ref={scrollRef}>
          {empty ? (
            <div className="intro">
              <GongOrb state={state} size={208} label={U.phaseIdle} />
              <h1>
                <span>{T.tutor.title}</span>
              </h1>
              <p className="intro-lede">{T.tutor.lede}</p>
              {locale !== "th" && <p className="intro-note">{T.tutor.answerLang}</p>}
              <div className="sugg-head">
                <span>{T.tutor.suggestions}</span>
                <span className="sugg-swipe">
                  {T.common.swipe}
                  <Icon name="arrow" size={14} />
                </span>
              </div>
              <div className="sugg">
                {SUGGEST.map((k, i) => (
                  <button key={k} type="button" className="sugg-card" style={{ "--i": i } as React.CSSProperties} onClick={() => ask(TH.tutor[k])}>
                    <Icon name="spark" size={16} />
                    <span>{T.tutor[k]}</span>
                    <Icon name="arrow" size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread">
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="q">
                    <span className="visually-hidden">{U.you}: </span>
                    {m.content}
                  </div>
                ) : (
                  <article key={i} className="a" aria-busy={busy && i === msgs.length - 1}>
                    <div className="a-head">
                      <GongOrb state={busy && i === msgs.length - 1 ? state : "idle"} lit={m.sources?.length ?? 0} size={26} />
                      <b>{U.ai}</b>
                      {m.mode && <span className="a-mode">{m.mode === "llm" ? T.tutor.modeLlm : m.mode === "retrieval" ? T.tutor.modeRetrieval : T.tutor.modeNone}</span>}
                    </div>
                    {m.content ? (
                      <div className="a-body">{withCites(m.content, i, m.sources)}</div>
                    ) : (
                      <div className="a-wait">
                        <span className="shimmer">{m.status ?? (m.sources?.length ? fmt(U.phaseFound, { n: m.sources.length }) : U.phaseSearching)}</span>
                        <span className="skel" />
                        <span className="skel short" />
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <div className="a-sources">
                        <div className="a-sources-head">
                          <span>
                            {U.sources} · {m.sources.length}
                          </span>
                          <span className="sugg-swipe">
                            {U.swipeSources}
                            <Icon name="arrow" size={14} />
                          </span>
                        </div>
                        <div className="a-sources-rail">
                          {m.sources.map((s) => sourceCard(s, i))}
                        </div>
                      </div>
                    )}
                    {m.mode && (
                      <div className="a-actions">
                        <button type="button" className="ghost-btn" onClick={() => copy(i)}>
                          <Icon name={copied === i ? "check" : "archive"} size={14} />
                          {copied === i ? U.copied : U.copy}
                        </button>
                        {m.flagged ? (
                          <span className="ghost-btn ok">
                            <Icon name="check" size={14} />
                            {T.tutor.flagged}
                          </span>
                        ) : (
                          <button type="button" className="ghost-btn" onClick={() => flag(i)}>
                            <Icon name="shield" size={14} />
                            {T.tutor.flag}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ),
              )}
            </div>
          )}
        </div>

        {!empty && (
        <aside className="stage-sources" aria-label={U.sources}>
          <div className="panel-head">
            <span className="stage-eyebrow">{U.sources}</span>
            <p>{U.sourcesLede}</p>
          </div>
          {panelSources.length ? (
            <div className="panel-list">
              {panelSources.map((s) => sourceCard(s, panelIndex))}
              <p className="panel-hint">{U.citeHint}</p>
            </div>
          ) : (
            <div className="panel-empty">
              <span className="panel-ghost" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p>{U.sourcesEmpty}</p>
            </div>
          )}
        </aside>
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <div className="composer-box">
          <textarea
            ref={boxRef}
            id="tutor-q"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // กด Enter ส่ง แต่ไม่ส่งระหว่างที่แป้นพิมพ์ยังประกอบตัวอักษรอยู่
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder={T.tutor.placeholder}
            aria-label={T.tutor.question}
          />
          <button className="send" type="submit" disabled={busy || !input.trim()} aria-label={T.tutor.ask}>
            {busy ? <span className="send-spin" aria-hidden="true" /> : <Icon name="arrow" size={20} />}
          </button>
        </div>
        <div className="composer-foot">
          <span>
            <Icon name="shield" size={12} /> {U.grounded}
          </span>
          <span className="composer-keys">{U.sendHint}</span>
        </div>
      </form>
    </section>
  );
}
