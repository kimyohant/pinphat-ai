"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BASE_HZ, NOTES, freqToNote, noteFreq, noteLabel, parseNotation, type NoteName } from "@/lib/notation";
import { detectPitch } from "@/lib/pitch";
import { ching, ranat } from "@/lib/synth-client";
import { NotationGrid } from "./NotationGrid";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { Icon } from "@/components/ui/Icon";

type Lesson = { id: number; title: string; notation: string; tempo: number; base_hz: number | null };
type Hit = { t: number; note: NoteName | null; octave: number };
type Result = {
  accuracy: number;
  timingMs: number;
  expected: number;
  hits: number;
  extras: number;
  errorBars: number[];
  slotState: Record<number, "hit" | "miss">;
  tips: string[];
};
type Phase = "idle" | "demo" | "countin" | "rec";

const KEYS: { note: NoteName; octave: number; key: string; alt: string }[] = [
  ...NOTES.map((n, i) => ({ note: n, octave: 0, key: String(i + 1), alt: "asdfghj"[i] })),
  { note: "ด", octave: 1, key: "8", alt: "k" },
];

export function PracticeCoach({ lesson, canSave }: { lesson: Lesson; canSave: boolean }) {
  const { t: T } = useT();
  const slots = useMemo(() => parseNotation(lesson.notation), [lesson.notation]);
  const [speed, setSpeed] = useState(0.75);
  const [mode, setMode] = useState<"keys" | "mic">("keys");
  const [withChing, setWithChing] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState(-1);
  const [result, setResult] = useState<Result | null>(null);
  const [base, setBase] = useState(lesson.base_hz ?? DEFAULT_BASE_HZ);
  const [status, setStatus] = useState("");
  const [lit, setLit] = useState<number | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const startRef = useRef(0);
  const eventsRef = useRef<Hit[]>([]);
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const micRef = useRef<{ stream: MediaStream; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null>(null);

  const slotSec = 60 / lesson.tempo / speed;
  const expected = slots.filter((s) => s.note).length;

  const ctx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const setPh = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPh("idle");
    setCurrent(-1);
    // ปิด AudioContext เพื่อหยุดเสียงที่ตั้งเวลาไว้แล้ว (ไมค์ผูกกับ context เดิมจึงต้องเปิดใหม่ด้วย)
    micRef.current?.stream.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      micRef.current?.stream.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    },
    [],
  );

  // ---------- เสียงตัวอย่าง ----------
  function listen() {
    const c = ctx();
    setResult(null);
    const start = c.currentTime + 0.25;
    slots.forEach((s) => {
      const when = start + s.index * slotSec;
      if (s.note) ranat(c, noteFreq(s.note, s.octave, base), when);
      if (withChing && s.pos === 1) ching(c, when, false, 0.06);
      if (withChing && s.pos === 3) ching(c, when, true, 0.08);
    });
    startRef.current = start;
    setPh("demo");
    const tick = () => {
      if (phaseRef.current === "idle") return;
      const i = Math.floor((c.currentTime - start) / slotSec);
      setCurrent(i);
      if (i >= slots.length) {
        setPh("idle");
        setCurrent(-1);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
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
        const p = detectPitch(m.buf, c.sampleRate);
        onHit(pending, p.f);
        pending = null;
      }
      prev2 = prev1;
      prev1 = lg;
      rafRef.current = requestAnimationFrame(loop);
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
          setBase(Math.round(f * 10) / 10);
          setStatus(fmt(T.coach.doSet, { hz: f.toFixed(1) }));
        }
      },
      () => done || c.currentTime > until,
    );
    setTimeout(() => !done && setStatus(T.coach.noSound), 4100);
  }

  // ---------- ฝึก ----------
  async function practice() {
    setResult(null);
    setStatus("");
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
    for (let k = 0; k < 4; k++) ching(c, countStart + k * slotSec, k % 2 === 1, k === 3 ? 0.14 : 0.08);
    const start = countStart + 4 * slotSec;
    startRef.current = start;
    eventsRef.current = [];
    if (withChing) slots.forEach((s) => s.pos % 2 === 1 && ching(c, start + s.index * slotSec, s.pos === 3, 0.05));
    setPh("countin");
    const end = start + slots.length * slotSec + 0.5;

    if (mode === "mic") {
      micLoop(
        (t, f) => {
          if (phaseRef.current !== "rec") return;
          const g = f > 0 ? freqToNote(f, base) : null;
          eventsRef.current.push({ t: t - start, note: g?.note ?? null, octave: g?.octave ?? 0 });
        },
        () => c.currentTime > end || phaseRef.current === "idle",
      );
    }

    const tick = () => {
      if (phaseRef.current === "idle") return;
      const t = c.currentTime;
      if (t >= start && phaseRef.current === "countin") setPh("rec");
      setCurrent(t >= start ? Math.floor((t - start) / slotSec) : -1);
      if (t > end) {
        setPh("idle");
        setCurrent(-1);
        finish();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ระนาดบนจอ / แป้นพิมพ์
  const strikeKey = useCallback(
    (k: number) => {
      const c = ctx();
      const key = KEYS[k];
      ranat(c, noteFreq(key.note, key.octave, base), c.currentTime);
      setLit(k);
      setTimeout(() => setLit((x) => (x === k ? null : x)), 120);
      if (phaseRef.current === "rec" && mode === "keys") {
        eventsRef.current.push({ t: c.currentTime - startRef.current, note: key.note, octave: key.octave });
      }
    },
    [base, ctx, mode],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return;
      const k = KEYS.findIndex((x) => x.key === e.key || x.alt === e.key.toLowerCase());
      if (k >= 0) {
        e.preventDefault();
        strikeKey(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [strikeKey]);

  // ---------- ให้คะแนน ----------
  function finish() {
    const tol = Math.min(0.16, slotSec * 0.45);
    const used = new Set<number>();
    const slotState: Record<number, "hit" | "miss"> = {};
    const errorBars = new Set<number>();
    const offsets: number[] = [];
    let hits = 0;
    const ev = eventsRef.current;
    slots.forEach((s) => {
      if (!s.note) return;
      const T = s.index * slotSec;
      let best = -1;
      ev.forEach((e, i) => {
        if (used.has(i) || Math.abs(e.t - T) > tol) return;
        if (best < 0 || Math.abs(e.t - T) < Math.abs(ev[best].t - T)) best = i;
      });
      const ok = best >= 0 && ev[best].note === s.note && (mode === "mic" || ev[best].octave === s.octave);
      if (best >= 0) {
        used.add(best);
        offsets.push(Math.abs(ev[best].t - T) * 1000);
      }
      if (ok) hits++;
      else errorBars.add(s.bar);
      slotState[s.index] = ok ? "hit" : "miss";
    });
    const timingMs = offsets.length ? Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length) : 0;
    const extras = ev.length - used.size;
    const accuracy = expected ? hits / expected : 0;
    const bars = [...errorBars].sort((a, b) => a - b);
    const tips: string[] = [];
    if (!ev.length) tips.push(mode === "mic" ? T.coach.tipNoMic : T.coach.tipNoTap);
    else if (accuracy >= 0.9) tips.push(speed < 1 ? T.coach.tipFaster : T.coach.tipPassed);
    if (bars.length && ev.length) tips.push(fmt(T.coach.tipBars, { bars: bars.map((b) => b + 1).join(", ") }));
    if (timingMs > 80) tips.push(fmt(T.coach.tipTiming, { ms: timingMs }));
    if (extras > 2) tips.push(fmt(T.coach.tipExtras, { n: extras }));
    const r: Result = { accuracy, timingMs, expected, hits, extras, errorBars: bars, slotState, tips };
    setResult(r);
    if (canSave && ev.length) {
      void fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, mode, speed, accuracy, timingMs, barErrors: bars }),
      }).then((res) => setStatus(res.ok ? T.coach.saved : T.coach.saveFailed));
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="stack-lg">
      <div className="card stack">
        <div className="row between">
          <div className="row">
            <button className="btn alt" onClick={listen} disabled={busy}>
              <Icon name="play" size={16} />
              {T.coach.listen}
            </button>
            <button className="btn" onClick={practice} disabled={busy}>
              <Icon name="learn" size={16} />
              {T.coach.start}
            </button>
            {busy && (
              <button className="btn ghost" onClick={stopAll}>
                {T.coach.stop}
              </button>
            )}
          </div>
          <div className="row small">
            <label className="check" style={{ alignItems: "center" }}>
              <input type="checkbox" checked={withChing} onChange={(e) => setWithChing(e.target.checked)} /> {T.coach.ching}
            </label>
            <select aria-label={T.coach.speed} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={busy} style={{ width: "auto" }}>
              <option value={0.5}>{fmt(T.coach.speedN, { n: 0.5 })}</option>
              <option value={0.75}>{fmt(T.coach.speedN, { n: 0.75 })}</option>
              <option value={1}>{fmt(T.coach.speedN, { n: 1 })}</option>
            </select>
          </div>
        </div>
        <div className="row small muted">
          <span>
            {phase === "countin" ? T.coach.countin : phase === "rec" ? T.coach.listening : phase === "demo" ? T.coach.demo : fmt(T.coach.summary, { notes: expected, slots: slots.length, ms: Math.round(slotSec * 1000) })}
          </span>
        </div>
        <NotationGrid slots={slots} current={current} errorBars={result?.errorBars} slotState={result?.slotState} />
      </div>

      <div className="grid cols-2">
        <div className="card stack">
          <div className="row between">
            <h3>{T.coach.how}</h3>
            <div className="row">
              <button className={`btn sm ${mode === "keys" ? "" : "ghost"}`} onClick={() => setMode("keys")} disabled={busy}>
                {T.coach.onScreen}
              </button>
              <button className={`btn sm ${mode === "mic" ? "" : "ghost"}`} onClick={() => setMode("mic")} disabled={busy}>
                {T.coach.realMic}
              </button>
            </div>
          </div>
          {mode === "keys" ? (
            <>
              <div className="ranat" role="group" aria-label={T.coach.onScreen}>
                {KEYS.map((k, i) => (
                  <button
                    key={i}
                    className={lit === i ? "hit" : undefined}
                    style={{ height: 150 - i * 9 }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      strikeKey(i);
                    }}
                    aria-label={fmt(T.coach.keyLabel, { note: noteLabel(k.note, k.octave) })}
                  >
                    <span>
                      {noteLabel(k.note, k.octave)}
                      <small>{k.key}</small>
                    </span>
                  </button>
                ))}
              </div>
              <p className="xs muted">{T.coach.tapHint}</p>
            </>
          ) : (
            <div className="stack small">
              <p>{T.coach.micPrivacy}</p>
              <div className="row">
                <button className="btn ghost sm" onClick={calibrate} disabled={busy}>
                  {T.coach.calibrate}
                </button>
                <span className="mono xs">ด = {base} Hz</span>
              </div>
              <p className="xs muted">{T.coach.calibrateHint}</p>
            </div>
          )}
          {status && <div className="notice small">{status}</div>}
        </div>

        <div className="card stack">
          <h3>{T.coach.result}</h3>
          {result ? (
            <>
              <div className="grid cols-3">
                <div className="stat">
                  <b style={{ color: result.accuracy >= 0.8 ? "var(--ok)" : result.accuracy >= 0.6 ? "var(--warn)" : "var(--crit)" }}>{Math.round(result.accuracy * 100)}%</b>
                  <span>{T.coach.correct}</span>
                </div>
                <div className="stat">
                  <b>±{result.timingMs}</b>
                  <span>{T.coach.timing}</span>
                </div>
                <div className="stat">
                  <b>
                    {result.hits}/{result.expected}
                  </b>
                  <span>{T.coach.notes}</span>
                </div>
              </div>
              <ul className="small" style={{ margin: 0, paddingLeft: "1.1em" }}>
                {result.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
              <Link className="btn ghost sm" href={`/tutor?q=${encodeURIComponent(T.coach.askTutorQ)}`}>
                <Icon name="tutor" size={16} />
                {T.coach.askTutor}
              </Link>
            </>
          ) : (
            <p className="small muted">{T.coach.idle}</p>
          )}
          {!canSave && <p className="xs muted">{T.coach.loginToSave}</p>}
        </div>
      </div>
    </div>
  );
}
