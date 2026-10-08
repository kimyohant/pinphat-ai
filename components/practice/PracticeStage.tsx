"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BASE_HZ, barCount, freqToNote, isStruck, noteLabel, parseNotation, type NoteName, type Stroke } from "@/lib/notation";
import { detectPitch } from "@/lib/pitch";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { PRACTICE_UI } from "@/lib/i18n/practice-ui";
import { Icon } from "@/components/ui/Icon";
import { NotationGrid } from "@/components/NotationGrid";
import { isPitched, keysFor, pulse, strike, type Key, type PlayKind } from "./kit";
import { VirtualInstrument } from "./VirtualInstrument";

type Lesson = { id: number; title: string; notation: string; tempo: number; base_hz: number | null };
type Hit = { t: number; note: NoteName | null; octave: number; stroke: Stroke | null };
type Result = { accuracy: number; timingMs: number; expected: number; hits: number; extras: number; errorBars: number[]; slotState: Record<number, "hit" | "miss">; tips: string[] };
type Phase = "idle" | "demo" | "countin" | "rec";

const SLOT_W = 60;

export function PracticeStage({ lesson, kind, register, canSave, header }: { lesson: Lesson; kind: PlayKind; register: number; canSave: boolean; header: React.ReactNode }) {
  const { t: T, locale } = useT();
  const P = PRACTICE_UI[locale];
  const slots = useMemo(() => parseNotation(lesson.notation), [lesson.notation]);
  const keys = useMemo(() => keysFor(kind), [kind]);
  const pitched = isPitched(kind);
  const [speed, setSpeed] = useState(0.75);
  const [mode, setMode] = useState<"keys" | "mic">("keys");
  const [withPulse, setWithPulse] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState(-1);
  const [result, setResult] = useState<Result | null>(null);
  const [live, setLive] = useState<Record<number, "hit" | "miss">>({});
  const [base, setBase] = useState(lesson.base_hz ?? DEFAULT_BASE_HZ);
  const [status, setStatus] = useState("");
  const [lit, setLit] = useState<number | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const startRef = useRef(0);
  const eventsRef = useRef<Hit[]>([]);
  const judgedRef = useRef<Set<number>>(new Set());
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const trackRef = useRef<HTMLDivElement>(null);
  const micRef = useRef<{ stream: MediaStream; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null>(null);

  const slotSec = 60 / lesson.tempo / speed;
  const expected = slots.filter(isStruck).length;
  const bars = barCount(slots);
  const tol = Math.min(0.16, slotSec * 0.45);

  const ctx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const setPh = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /** เลื่อนแถบโน้ตด้วย transform โดยตรง ไม่ผ่าน state: 60 ครั้งต่อวินาทีผ่าน React แล้วโน้ตกระตุกบนมือถือ */
  const moveLane = useCallback((pos: number) => {
    const el = trackRef.current;
    if (el) el.style.transform = `translate3d(${-(pos + 0.5) * SLOT_W}px, 0, 0)`;
  }, []);

  useEffect(() => moveLane(-1.2), [moveLane, lesson.id]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPh("idle");
    setCurrent(-1);
    moveLane(-1.2);
    // ปิด AudioContext เพื่อหยุดเสียงที่ตั้งเวลาไว้แล้ว (ไมค์ผูกกับ context เดิมจึงต้องเปิดใหม่ด้วย)
    micRef.current?.stream.getTracks().forEach((tr) => tr.stop());
    micRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
  }, [moveLane]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      micRef.current?.stream.getTracks().forEach((tr) => tr.stop());
      void ctxRef.current?.close();
    },
    [],
  );

  /** ความยาวเสียงปี่: ยาวจนถึงโน้ตถัดไป ไม่เกินหนึ่งห้อง */
  const holdFor = (i: number) => {
    let gap = 1;
    while (gap < 4 && slots[i + gap] && !isStruck(slots[i + gap])) gap++;
    return Math.max(0.2, gap * slotSec * 0.95);
  };

  function run(start: number, until: number, onDone?: () => void) {
    const c = ctx();
    const tick = () => {
      if (phaseRef.current === "idle") return;
      const now = c.currentTime;
      const pos = (now - start) / slotSec;
      moveLane(pos);
      if (now >= start && phaseRef.current === "countin") setPh("rec");
      setCurrent(now >= start ? Math.floor(pos) : -1);
      if (now > until) {
        setPh("idle");
        setCurrent(-1);
        moveLane(-1.2);
        onDone?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------- เสียงตัวอย่าง ----------
  function listen() {
    const c = ctx();
    setResult(null);
    setLive({});
    const start = c.currentTime + 0.4;
    slots.forEach((s) => {
      const when = start + s.index * slotSec;
      if (isStruck(s)) strike(c, kind, register, { note: s.note, octave: s.octave, stroke: s.stroke ?? null }, when, base, holdFor(s.index));
      if (withPulse && s.pos === 1) pulse(c, kind, when, false, 0.05);
      if (withPulse && s.pos === 3) pulse(c, kind, when, true, 0.07);
    });
    startRef.current = start;
    setPh("demo");
    run(start, start + slots.length * slotSec);
  }

  // ---------- ไมค์ ----------
  async function ensureMic() {
    if (micRef.current) return micRef.current;
    const c = ctx();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = c.createMediaStreamSource(stream);
    const analyser = c.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    micRef.current = { stream, analyser, buf: new Float32Array(analyser.fftSize) };
    return micRef.current;
  }

  /** วนอ่านไมค์: จับจุดเริ่มเสียงจากพลังงานที่พุ่งขึ้น แล้ววัดระดับเสียงหลังจากนั้นราว 40 ms */
  function micLoop(onHit: (t: number, f: number) => void, until: () => boolean) {
    const c = ctx();
    const m = micRef.current!;
    let prev1 = -12;
    let prev2 = -12;
    let lastOnset = -1;
    let pending: number | null = null;
    let ambient = 0.004;
    const loop = () => {
      if (until()) return;
      m.analyser.getFloatTimeDomainData(m.buf);
      let s = 0;
      for (let i = 0; i < m.buf.length; i++) s += m.buf[i] * m.buf[i];
      const rms = Math.sqrt(s / m.buf.length);
      const lg = Math.log(rms + 1e-5);
      const now = c.currentTime;
      if (phaseRef.current === "countin") ambient = ambient * 0.95 + rms * 0.05;
      const thr = Math.max(0.012, ambient * 4);
      if (pending == null && rms > thr && lg - Math.min(prev1, prev2) > 0.45 && now - lastOnset > 0.09) {
        pending = now - m.buf.length / c.sampleRate / 2;
        lastOnset = now;
      } else if (pending != null && now - pending > 0.05) {
        onHit(pending, pitched ? detectPitch(m.buf, c.sampleRate).f : 0);
        pending = null;
      }
      prev2 = prev1;
      prev1 = lg;
      requestAnimationFrame(loop);
    };
    loop();
  }

  async function calibrate() {
    try {
      await ensureMic();
    } catch {
      setStatus(T.coach.micDenied);
      return;
    }
    setStatus(T.coach.strikeDo);
    const c = ctx();
    const until = c.currentTime + 4;
    let done = false;
    micLoop(
      (_t, f) => {
        if (f > 0 && !done) {
          done = true;
          // ระนาดทุ้มและฆ้องวงอยู่ต่ำกว่าหนึ่งช่วงทบ เทียบ ด กลับขึ้นมาที่ช่วงอ้างอิง
          const hz = f * Math.pow(2, -register);
          setBase(Math.round(hz * 10) / 10);
          setStatus(fmt(T.coach.doSet, { hz: hz.toFixed(1) }));
        }
      },
      () => done || c.currentTime > until,
    );
    setTimeout(() => !done && setStatus(T.coach.noSound), 4100);
  }

  /** เทียบสิ่งที่ตีกับช่องที่ควรตี: เครื่องหนังและฉิ่งจากไมค์นับเฉพาะจังหวะ เพราะแยกชนิดการตีจากเสียงไม่ได้ */
  const matches = (e: Hit, s: (typeof slots)[number]) => {
    if (s.stroke) return mode === "mic" ? true : e.stroke === s.stroke;
    return e.note === s.note && (mode === "mic" || e.octave === s.octave);
  };

  /** ตัดสินทันทีที่ตี ให้ผู้เรียนเห็นถูกผิดบนแถบโน้ตระหว่างเล่น ไม่ต้องรอจบเพลง */
  function judge(e: Hit) {
    let best = -1;
    slots.forEach((s) => {
      if (!isStruck(s) || judgedRef.current.has(s.index)) return;
      const d = Math.abs(e.t - s.index * slotSec);
      if (d <= tol && (best < 0 || d < Math.abs(e.t - best * slotSec))) best = s.index;
    });
    if (best < 0) return;
    judgedRef.current.add(best);
    const ok = matches(e, slots[best]);
    setLive((m) => ({ ...m, [best]: ok ? "hit" : "miss" }));
  }

  // ---------- ฝึก ----------
  async function practice() {
    setResult(null);
    setLive({});
    setStatus("");
    judgedRef.current = new Set();
    if (mode === "mic") {
      try {
        await ensureMic();
      } catch {
        setStatus(T.coach.micFallback);
        return;
      }
    }
    const c = ctx();
    const countStart = c.currentTime + 0.3;
    for (let k = 0; k < 4; k++) pulse(c, kind, countStart + k * slotSec, k % 2 === 1, k === 3 ? 0.14 : 0.08);
    const start = countStart + 4 * slotSec;
    startRef.current = start;
    eventsRef.current = [];
    if (withPulse) slots.forEach((s) => s.pos % 2 === 1 && pulse(c, kind, start + s.index * slotSec, s.pos === 3, 0.05));
    setPh("countin");
    const end = start + slots.length * slotSec + 0.5;
    if (mode === "mic") {
      micLoop(
        (time, f) => {
          if (phaseRef.current !== "rec") return;
          const g = f > 0 ? freqToNote(f, base * Math.pow(2, register)) : null;
          const e: Hit = { t: time - start, note: g?.note ?? null, octave: g?.octave ?? 0, stroke: null };
          eventsRef.current.push(e);
          judge(e);
        },
        () => c.currentTime > end || phaseRef.current === "idle",
      );
    }
    run(start, end, finish);
  }

  const strikeKey = useCallback(
    (i: number) => {
      const c = ctx();
      const k = keys[i];
      strike(c, kind, register, k, c.currentTime, base);
      setLit(i);
      setTimeout(() => setLit((x) => (x === i ? null : x)), 130);
      if (phaseRef.current === "rec" && mode === "keys") {
        const e: Hit = { t: c.currentTime - startRef.current, note: k.note, octave: k.octave, stroke: k.stroke };
        eventsRef.current.push(e);
        judge(e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, ctx, mode, keys, kind, register, slotSec],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return;
      const i = keys.findIndex((x) => x.key === e.key || x.alt === e.key.toLowerCase());
      if (i >= 0) {
        e.preventDefault();
        strikeKey(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [strikeKey, keys]);

  // ---------- ให้คะแนน ----------
  function finish() {
    const used = new Set<number>();
    const slotState: Record<number, "hit" | "miss"> = {};
    const errorBars = new Set<number>();
    const offsets: number[] = [];
    let hits = 0;
    const ev = eventsRef.current;
    slots.forEach((s) => {
      if (!isStruck(s)) return;
      const at = s.index * slotSec;
      let best = -1;
      ev.forEach((e, i) => {
        if (used.has(i) || Math.abs(e.t - at) > tol) return;
        if (best < 0 || Math.abs(e.t - at) < Math.abs(ev[best].t - at)) best = i;
      });
      const ok = best >= 0 && matches(ev[best], s);
      if (best >= 0) {
        used.add(best);
        offsets.push(Math.abs(ev[best].t - at) * 1000);
      }
      if (ok) hits++;
      else errorBars.add(s.bar);
      slotState[s.index] = ok ? "hit" : "miss";
    });
    const timingMs = offsets.length ? Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length) : 0;
    const extras = ev.length - used.size;
    const accuracy = expected ? hits / expected : 0;
    const errs = [...errorBars].sort((a, b) => a - b);
    const tips: string[] = [];
    if (!ev.length) tips.push(mode === "mic" ? T.coach.tipNoMic : T.coach.tipNoTap);
    else if (accuracy >= 0.9) tips.push(speed < 1 ? T.coach.tipFaster : T.coach.tipPassed);
    if (errs.length && ev.length) tips.push(fmt(T.coach.tipBars, { bars: errs.map((b) => b + 1).join(", ") }));
    if (timingMs > 80) tips.push(fmt(T.coach.tipTiming, { ms: timingMs }));
    if (extras > 2) tips.push(fmt(T.coach.tipExtras, { n: extras }));
    setResult({ accuracy, timingMs, expected, hits, extras, errorBars: errs, slotState, tips });
    setLive(slotState);
    if (canSave && ev.length) {
      void fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, mode, speed, accuracy, timingMs, barErrors: errs }),
      }).then((res) => setStatus(res.ok ? T.coach.saved : T.coach.saveFailed));
    }
  }

  const busy = phase !== "idle";
  const strokeName = (s: string) => (P as Record<string, string>)[`stroke_${s}`] ?? s;
  const keyLabel = (k: Key) => (k.stroke ? strokeName(k.stroke) : fmt(T.coach.keyLabel, { note: noteLabel(k.note, k.octave) }));
  const score = result ? Math.round(result.accuracy * 100) : null;
  const ring = 2 * Math.PI * 52;

  return (
    <section className="pstage on-night" data-phase={phase}>
      <div className="pstage-bg" aria-hidden="true" />
      <div className="pstage-head">{header}</div>

      <div className="pstage-body">
        <div className="pstage-main">
          {/* แถบโน้ตไหลผ่านเส้นทอง */}
          <div className="lane" aria-label={T.viz.notation}>
            <div className="lane-now" aria-hidden="true">
              <span />
            </div>
            <div className="lane-track" ref={trackRef}>
              {slots.map((s) => {
                const st = live[s.index];
                const struck = isStruck(s);
                return (
                  <span
                    key={s.index}
                    className={["lane-slot", s.pos === 0 ? "bar-start" : "", struck ? "struck" : "rest", s.index === current ? "now" : "", st ?? ""].join(" ")}
                    style={{ width: SLOT_W }}
                  >
                    {s.pos === 0 && <i className="lane-bar">{s.bar + 1}</i>}
                    {struck ? (
                      <b>
                        {noteLabel(s.note, s.octave, s.stroke)}
                        {s.stroke && <small>{strokeName(s.stroke)}</small>}
                      </b>
                    ) : (
                      <em />
                    )}
                  </span>
                );
              })}
            </div>
            <p className="lane-hint">{phase === "countin" ? T.coach.countin : phase === "rec" ? P.listening : phase === "demo" ? T.coach.demo : P.laneHint}</p>
          </div>

          <VirtualInstrument kind={kind} register={register} keys={keys} lit={lit} onStrike={strikeKey} label={T.coach.onScreen} strokeName={strokeName} keyLabel={keyLabel} />
          <p className="vi-hint">{mode === "mic" && !pitched ? P.micRhythm : (P as Record<string, string>)[`hint_${kind}`]}</p>

          <div className="transport">
            <button type="button" className="t-btn" onClick={listen} disabled={busy}>
              <Icon name="play" size={16} />
              {T.coach.listen}
            </button>
            {busy ? (
              <button type="button" className="t-go stop" onClick={stopAll}>
                <Icon name="close" size={18} />
                {T.coach.stop}
              </button>
            ) : (
              <button type="button" className="t-go" onClick={practice}>
                <Icon name="spark" size={18} />
                {T.coach.start}
              </button>
            )}
            <div className="t-seg" role="radiogroup" aria-label={T.coach.speed}>
              {[0.5, 0.75, 1].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={speed === v} onClick={() => setSpeed(v)} disabled={busy}>
                  {v}×
                </button>
              ))}
            </div>
            <div className="t-seg" role="radiogroup" aria-label={T.coach.how}>
              <button type="button" role="radio" aria-checked={mode === "keys"} onClick={() => setMode("keys")} disabled={busy}>
                {P.keysMode}
              </button>
              <button type="button" role="radio" aria-checked={mode === "mic"} onClick={() => setMode("mic")} disabled={busy}>
                <Icon name="field" size={14} />
                {P.micMode}
              </button>
            </div>
            <label className="t-check">
              <input type="checkbox" checked={withPulse} onChange={(e) => setWithPulse(e.target.checked)} /> {T.coach.ching}
            </label>
          </div>
          {mode === "mic" && pitched && (
            <div className="mic-row">
              <span>{T.coach.micPrivacy}</span>
              <button type="button" className="t-btn sm" onClick={calibrate} disabled={busy}>
                {T.coach.calibrate}
              </button>
              <span className="mono">ด = {base} Hz</span>
            </div>
          )}
          {status && <p className="p-status">{status}</p>}
        </div>

        <aside className="coach" aria-live="polite">
          <span className="stage-eyebrow">{P.coach}</span>
          {result ? (
            <>
              <div className="score">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <defs>
                    <linearGradient id="score-g" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="var(--bronze-200)" />
                      <stop offset="1" stopColor="var(--bronze-500)" />
                    </linearGradient>
                  </defs>
                  <circle cx="60" cy="60" r="52" className="score-track" />
                  <circle cx="60" cy="60" r="52" className="score-arc" style={{ strokeDasharray: ring, strokeDashoffset: ring * (1 - (score ?? 0) / 100) }} />
                </svg>
                <div className="score-num">
                  <b>{score}%</b>
                  <span>{T.coach.correct}</span>
                </div>
              </div>
              <div className="coach-stats">
                <div>
                  <b>±{result.timingMs}</b>
                  <span>{T.coach.timing}</span>
                </div>
                <div>
                  <b>
                    {result.hits}/{result.expected}
                  </b>
                  <span>{T.coach.notes}</span>
                </div>
              </div>
              <div className="barmap" role="img" aria-label={P.barMap}>
                <span className="barmap-label">{P.barMap}</span>
                <div className="barmap-cells" style={{ gridTemplateColumns: `repeat(${Math.min(8, bars)}, minmax(0, 1fr))` }}>
                  {Array.from({ length: bars }, (_, b) => (
                    <i key={b} className={result.errorBars.includes(b) ? "bad" : "good"}>
                      {b + 1}
                    </i>
                  ))}
                </div>
                <span className="barmap-hint">{P.barMapHint}</span>
              </div>
              <ul className="coach-tips">
                {result.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
              <Link className="t-btn block" href={`/tutor?q=${encodeURIComponent(T.coach.askTutorQ)}`}>
                <Icon name="tutor" size={16} />
                {T.coach.askTutor}
              </Link>
            </>
          ) : (
            <>
              <p className="coach-ready">{phase === "rec" || phase === "countin" ? P.listening : P.ready}</p>
              <ol className="coach-how">
                <li>{P.how1}</li>
                <li>{P.how2}</li>
                <li>{P.how3}</li>
              </ol>
            </>
          )}
          {!canSave && <p className="coach-note">{T.coach.loginToSave}</p>}
          <details className="coach-score">
            <summary>{P.fullScore}</summary>
            <NotationGrid slots={slots} current={current} errorBars={result?.errorBars} slotState={result?.slotState} label={T.viz.notation} />
          </details>
        </aside>
      </div>
    </section>
  );
}
