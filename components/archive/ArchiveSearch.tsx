"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { ARCHIVE_UI } from "@/lib/i18n/archive-ui";
import { Icon } from "@/components/ui/Icon";

type R = { id: number; title: string; snippet: string; citation: string; level: number; href: string | null };

/** ช่องค้นทั้งคลัง: ผลขึ้นระหว่างพิมพ์ ใช้ตัวค้นคืนเดียวกับครู AI */
export function ArchiveSearch() {
  const { t: T, locale } = useT();
  const A = ARCHIVE_UI[locale];
  const [q, setQ] = useState("");
  const [res, setRes] = useState<R[] | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  async function run(query: string, commit = false) {
    const n = ++seq.current;
    if (query.trim().length < 2) {
      setRes(null);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/archive/search?${new URLSearchParams({ q: query, ...(commit ? { commit: "1" } : {}) })}`);
      const j = (await r.json()) as { results: R[] };
      // ผลของคำค้นเก่าที่กลับมาช้ากว่าคำค้นใหม่ต้องทิ้ง ไม่อย่างนั้นผลจะสลับไปมา
      if (n === seq.current) setRes(j.results);
    } finally {
      if (n === seq.current) setBusy(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => void run(q), 260);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // เน้นคำค้นในข้อความผลลัพธ์
  const mark = (text: string) => {
    const words = q.trim().split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) return text;
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
  };

  return (
    <div className="asearch">
      <form
        className="asearch-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q, true);
        }}
      >
        <Icon name="spark" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={A.searchPh} aria-label={A.searchPh} autoComplete="off" />
        {busy ? <span className="asearch-spin" aria-label={A.searching} /> : <kbd>Enter</kbd>}
      </form>
      <p className="asearch-hint">
        <Icon name="shield" size={12} /> {A.searchHint}
      </p>
      {res && (
        <div className="asearch-results" aria-live="polite">
          <div className="asearch-head">
            <span>{res.length ? fmt(A.results, { n: res.length }) : A.noResults}</span>
            <Link href={`/tutor?q=${encodeURIComponent(q)}`} className="asearch-ask">
              <Icon name="tutor" size={14} />
              {A.askTutor}
            </Link>
          </div>
          {res.map((r) => {
            const body = (
              <>
                <span className="ar-top">
                  <b>{mark(r.title)}</b>
                  <span className={`badge l${r.level}`}>
                    L{r.level} · {T.levels[r.level as 1 | 2 | 3 | 4 | 5]}
                  </span>
                </span>
                <span className="ar-snip">{mark(r.snippet)}</span>
                <span className="ar-cite">{r.citation}</span>
              </>
            );
            return r.href ? (
              <Link key={r.id} href={r.href} className="ar">
                {body}
              </Link>
            ) : (
              <div key={r.id} className="ar">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
