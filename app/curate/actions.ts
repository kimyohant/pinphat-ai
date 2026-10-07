"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { audit, now, one, run, tx } from "@/lib/db";
import { indexSegment } from "@/lib/kb";
import { parseNotation } from "@/lib/notation";
import { json } from "@/lib/format";
import type { Analysis } from "@/lib/audio";

export async function reviewSegment(formData: FormData) {
  const user = await requireRole("curator");
  const id = Number(formData.get("segmentId"));
  const decision = String(formData.get("decision"));
  const sg = one<{ id: number; kind: string; session_id: number; ai_suggestion: string | null; person_id: number | null }>(
    "SELECT sg.id, sg.kind, sg.session_id, sg.ai_suggestion, s.person_id FROM segments sg JOIN sessions s ON s.id = sg.session_id WHERE sg.id = ?",
    id,
  );
  if (!sg) redirect("/curate");
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  if (decision === "reject") {
    run("UPDATE segments SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?", str("reviewNote"), user.id, now(), id);
    indexSegment(id);
    audit(user.id, "segment.reject", `segment:${id}`, str("reviewNote"));
    revalidatePath("/curate");
    redirect("/curate?done=rejected");
  }

  const notation = str("notation") || null;
  if (notation && parseNotation(notation).length === 0) redirect(`/curate/${id}?error=notation`);
  const ai = json<Analysis | null>(sg.ai_suggestion, null);

  tx(() => {
    let variantId = Number(formData.get("variantId")) || null;
    const workId = Number(formData.get("workId")) || null;
    if (!variantId && workId && str("newVariant")) {
      variantId = run("INSERT INTO variants (work_id, person_id, name, description) VALUES (?, ?, ?, ?)", workId, sg.person_id, str("newVariant"), "เพิ่มระหว่างตรวจรับรอง").id;
    }
    run(
      "UPDATE segments SET work_id = ?, variant_id = ?, instrument_id = ?, notation = ?, transcript = ?, status = 'approved', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      workId,
      variantId,
      Number(formData.get("instrumentId")) || null,
      notation,
      str("transcript") || null,
      str("reviewNote"),
      user.id,
      now(),
      id,
    );
    if (sg.kind === "tuning" && ai?.tuning) {
      run("DELETE FROM tunings WHERE segment_id = ?", id);
      run(
        "INSERT INTO tunings (segment_id, instrument_id, person_id, base_hz, steps, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        Number(formData.get("instrumentId")) || null,
        sg.person_id,
        ai.tuning.baseHz,
        JSON.stringify(ai.tuning.steps),
        now(),
      );
    }
    if (formData.get("makeLesson") && notation) {
      const work = one<{ title: string }>("SELECT title FROM works WHERE id = ?", workId ?? 0);
      const variant = one<{ name: string }>("SELECT name FROM variants WHERE id = ?", variantId ?? 0);
      run(
        "INSERT INTO lessons (title, grade, indicator, description, segment_id, instrument_id, notation, tempo, difficulty, base_hz, created_by, created_at) VALUES (?, 'ม.1–ม.6', ?, ?, ?, ?, ?, ?, 2, ?, ?, ?)",
        `${work?.title ?? "เพลงจากคลัง"}${variant ? ` · ${variant.name}` : ""}`,
        str("indicator") || "ศ 2.2",
        "บทเรียนที่สร้างจากการบรรเลงที่ผ่านการรับรองแล้ว",
        id,
        Number(formData.get("instrumentId")) || 1,
        notation,
        ai?.slotSec ? Math.round(60 / ai.slotSec) : 140,
        ai?.baseHz ?? null,
        user.id,
        now(),
      );
    }
  });
  const chunks = indexSegment(id);
  audit(user.id, "segment.approve", `segment:${id}`, `indexed ${chunks} chunks`);
  revalidatePath("/curate");
  redirect(`/curate?done=approved&chunks=${chunks}`);
}

export async function resolveFlag(id: number) {
  const user = await requireRole("curator");
  run("UPDATE tutor_flags SET status = 'resolved' WHERE id = ?", id);
  audit(user.id, "flag.resolve", `flag:${id}`);
  revalidatePath("/curate");
}
