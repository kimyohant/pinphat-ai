import { getUser, levelsFor } from "@/lib/auth";
import { all } from "@/lib/db";
import { retrieve } from "@/lib/kb";
import { recordGap } from "@/lib/gaps";

// ค้นทั้งคลังด้วยตัวค้นคืนเดียวกับครู AI กรองสิทธิ์ก่อนค้น ชิ้นที่ผู้ชมไม่มีสิทธิ์จึงไม่ถูกส่งออกไปเลย
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return Response.json({ results: [] });
  const user = await getUser();
  const chunks = retrieve(q, levelsFor(user), 8);
  // เก็บเป็นช่องว่างความรู้เฉพาะตอนกดค้นจริง ไม่เก็บทุกตัวอักษรที่พิมพ์ระหว่างทาง
  if (!chunks.length && url.searchParams.get("commit") === "1" && q.length >= 3) recordGap(q, user.role);
  const ids = chunks.map((c) => c.id);
  const owners = ids.length ? all<{ id: number; person_id: number | null }>(`SELECT id, person_id FROM kb_chunks WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];
  return Response.json({
    results: chunks.map((c) => {
      const pid = owners.find((o) => o.id === c.id)?.person_id ?? null;
      return {
        id: c.id,
        title: c.title,
        snippet: c.text.length > 220 ? `${c.text.slice(0, 220)}…` : c.text,
        citation: c.citation,
        level: c.access_level,
        href: pid ? `/archive/person/${pid}${c.source_type === "segment" ? `#seg-${c.source_id}` : ""}` : null,
      };
    }),
  });
}
