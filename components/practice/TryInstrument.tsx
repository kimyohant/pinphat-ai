"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BASE_HZ, noteLabel } from "@/lib/notation";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { PRACTICE_UI } from "@/lib/i18n/practice-ui";
import { keysFor, strike, type Key, type PlayKind } from "./kit";
import { VirtualInstrument } from "./VirtualInstrument";

/** ลองตีเครื่องที่เลือกได้ทันทีในหน้าเลือกบทเรียน ไม่บันทึกผล ไม่ให้คะแนน */
export function TryInstrument({ kind, register }: { kind: PlayKind; register: number }) {
  const { t: T, locale } = useT();
  const P = PRACTICE_UI[locale];
  const keys = useMemo(() => keysFor(kind), [kind]);
  const [lit, setLit] = useState<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const hit = useCallback(
    (i: number) => {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const c = ctxRef.current;
      if (c.state === "suspended") void c.resume();
      strike(c, kind, register, keys[i], c.currentTime, DEFAULT_BASE_HZ);
      setLit(i);
      setTimeout(() => setLit((x) => (x === i ? null : x)), 130);
    },
    [keys, kind, register],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof Element && e.target.closest("input, textarea, select"))) return;
      const i = keys.findIndex((x) => x.key === e.key || x.alt === e.key.toLowerCase());
      if (i >= 0) hit(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hit, keys]);

  useEffect(() => () => void ctxRef.current?.close(), []);

  const strokeName = (s: string) => (P as Record<string, string>)[`stroke_${s}`] ?? s;
  const keyLabel = (k: Key) => (k.stroke ? strokeName(k.stroke) : fmt(T.coach.keyLabel, { note: noteLabel(k.note, k.octave) }));
  return <VirtualInstrument kind={kind} register={register} keys={keys} lit={lit} onStrike={hit} label={P.tryIt} strokeName={strokeName} keyLabel={keyLabel} />;
}
