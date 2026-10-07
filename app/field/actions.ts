"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { audit, now, one, run, tx } from "@/lib/db";
import { CHECKLIST, TK_LABELS } from "@/lib/access";
import { checkFixity, getSession, nextSessionCode, saveFile } from "@/lib/field";
import { json } from "@/lib/format";

export async function createSession(formData: FormData) {
  const user = await requireRole("collector", "curator");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const title = str("title");
  let personId = Number(formData.get("personId")) || null;
  const level = Number(formData.get("accessLevel"));
  if (!title || !(level >= 1 && level <= 5)) redirect("/field/new?error=missing");
  if (!personId && !str("newPersonName")) redirect("/field/new?error=person");
  const labels = TK_LABELS.map((t) => t.code).filter((c) => formData.get(`tk:${c}`));
  const evidence = formData.get("evidence");

  const id = tx(() => {
    if (!personId) {
      personId = run(
        "INSERT INTO persons (display_name, is_pseudonym, role, province, district, birth_year, bio, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        str("newPersonName"),
        formData.get("isPseudonym") ? 1 : 0,
        str("newPersonRole") || "master",
        str("province"),
        str("district"),
        Number(formData.get("birthYear")) || null,
        str("newPersonBio"),
        user.id,
        now(),
      ).id;
      const teacherId = Number(formData.get("teacherId")) || null;
      if (teacherId) run("INSERT INTO lineage (teacher_id, student_id, note) VALUES (?, ?, ?)", teacherId, personId, "บันทึกจากรอบลงพื้นที่");
    }
    const consentId = run(
      "INSERT INTO consents (person_id, access_level, tk_labels, method, scope_note, granted_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      personId,
      level,
      JSON.stringify(labels),
      str("method") || "signature",
      str("scopeNote"),
      now(),
      user.id,
    ).id;
    const sessionId = run(
      "INSERT INTO sessions (code, title, person_id, consent_id, province, district, place, recorded_on, collector_id, checklist, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
      nextSessionCode(),
      title,
      personId,
      consentId,
      str("province"),
      str("district"),
      str("place"),
      str("recordedOn") || now().slice(0, 10),
      user.id,
      JSON.stringify({ consent: true }),
      str("notes"),
      now(),
    ).id;
    return { sessionId, consentId };
  });

  if (evidence instanceof File && evidence.size > 0) {
    const f = saveFile(id.sessionId, evidence.name, evidence.type, Buffer.from(await evidence.arrayBuffer()));
    run("UPDATE consents SET evidence_path = ? WHERE id = ?", f.rel, id.consentId);
  }
  audit(user.id, "session.create", `session:${id.sessionId}`, `consent L${level}`);
  redirect(`/field/${id.sessionId}`);
}

export async function toggleCheck(sessionId: number, key: string) {
  await requireRole("collector", "curator");
  const s = getSession(sessionId);
  if (!s || !CHECKLIST.some((c) => c.key === key)) return;
  const c = json<Record<string, boolean>>(s.checklist, {});
  c[key] = !c[key];
  run("UPDATE sessions SET checklist = ? WHERE id = ?", JSON.stringify(c), sessionId);
  revalidatePath(`/field/${sessionId}`);
}

export async function addTranscript(formData: FormData) {
  const user = await requireRole("collector", "curator");
  const sessionId = Number(formData.get("sessionId"));
  const text = String(formData.get("transcript") ?? "").trim();
  if (!text) return;
  const id = run("INSERT INTO segments (session_id, kind, transcript, status, created_at) VALUES (?, 'interview', ?, 'pending', ?)", sessionId, text, now()).id;
  audit(user.id, "segment.transcript", `segment:${id}`);
  revalidatePath(`/field/${sessionId}`);
}

export async function submitSession(sessionId: number) {
  const user = await requireRole("collector", "curator");
  const s = getSession(sessionId);
  if (!s) return;
  const n = one<{ n: number }>("SELECT COUNT(*) AS n FROM segments WHERE session_id = ?", sessionId)?.n ?? 0;
  if (!s.consent_id || n === 0) return;
  run("UPDATE sessions SET status = 'submitted' WHERE id = ?", sessionId);
  audit(user.id, "session.submit", `session:${sessionId}`);
  revalidatePath(`/field/${sessionId}`);
  revalidatePath("/field");
}

export async function runFixity(sessionId: number) {
  const user = await requireRole("collector", "curator");
  const r = checkFixity(sessionId);
  audit(user.id, "fixity.check", `session:${sessionId}`, r.map((x) => `${x.filename}:${x.ok ? "ok" : "FAIL"}`).join(", "));
  revalidatePath(`/field/${sessionId}`);
}
