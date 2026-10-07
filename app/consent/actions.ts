"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { audit, now, one, run } from "@/lib/db";
import { applyLevel, applyRevoke } from "@/lib/consent";
import { closeTasks, createTask } from "@/lib/tasks";

const ROLES = ["collector", "curator", "community"] as const;

export async function changeLevel(formData: FormData) {
  const user = await requireRole(...ROLES);
  const id = Number(formData.get("consentId"));
  const r = applyLevel(id, Number(formData.get("level")));
  if (!r) return;
  audit(user.id, "consent.level", `consent:${id}`, `L${r.from} → L${formData.get("level")}, indexed ${r.indexed}`);
  revalidatePath("/consent");
}

export async function revokeConsent(formData: FormData) {
  const user = await requireRole(...ROLES);
  const id = Number(formData.get("consentId"));
  if (formData.get("confirm") !== "yes") return;
  const removed = applyRevoke(id);
  audit(user.id, "consent.revoke", `consent:${id}`, `removed ${removed} chunks from AI index`);
  revalidatePath("/consent");
}

// ---------- คำขอจากชุมชน (ADR-0001 ข้อ 4) ----------

const KINDS = ["revoke", "level", "correct", "other"];

export async function createRequest(formData: FormData) {
  const user = await requireRole(...ROLES);
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const consentId = Number(formData.get("consentId"));
  const kind = str("kind");
  if (!consentId || !KINDS.includes(kind) || !str("requester")) redirect("/consent/requests?error=missing");
  const newLevel = kind === "level" ? Number(formData.get("newLevel")) || null : null;
  const id = run(
    "INSERT INTO consent_requests (consent_id, channel, requester, relation, kind, new_level, details, status, received_by, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)",
    consentId,
    str("channel"),
    str("requester"),
    str("relation"),
    kind,
    newLevel,
    str("details"),
    user.id,
    now(),
  ).id;
  const person = one<{ name: string }>("SELECT p.display_name AS name FROM consents c JOIN persons p ON p.id = c.person_id WHERE c.id = ?", consentId)?.name ?? "";
  createTask({ type: "consent_request", subject: `creq:${id}`, title: `${str("requester")} · ${person}`, role: "community", createdBy: user.id });
  audit(user.id, "consent.request", `creq:${id}`, `${kind} consent:${consentId}`);
  revalidatePath("/consent/requests");
  revalidatePath("/work");
  redirect(`/consent/requests#creq-${id}`);
}

/** ยืนยันตัวผู้ขอ ต้องเป็นคนละคนกับผู้รับเรื่อง (หลักสองคน) */
export async function verifyRequest(formData: FormData) {
  const user = await requireRole(...ROLES);
  const id = Number(formData.get("requestId"));
  const r = one<{ status: string; received_by: number }>("SELECT status, received_by FROM consent_requests WHERE id = ?", id);
  if (!r || r.status !== "received") return;
  if (r.received_by === user.id) redirect(`/consent/requests?error=same#creq-${id}`);
  run("UPDATE consent_requests SET status = 'verified', verified_by = ?, verified_at = ?, verify_note = ? WHERE id = ?", user.id, now(), String(formData.get("verifyNote") ?? "").trim(), id);
  audit(user.id, "consent.request.verify", `creq:${id}`);
  revalidatePath("/consent/requests");
}

export async function resolveRequest(formData: FormData) {
  const user = await requireRole(...ROLES);
  const id = Number(formData.get("requestId"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("outcome") ?? "").trim();
  const r = one<{ status: string; kind: string; consent_id: number; new_level: number | null }>("SELECT status, kind, consent_id, new_level FROM consent_requests WHERE id = ?", id);
  if (!r) return;
  let outcome = note;
  if (decision === "reject") {
    if (r.status === "done" || r.status === "rejected") return;
    run("UPDATE consent_requests SET status = 'rejected', done_by = ?, done_at = ?, outcome = ? WHERE id = ?", user.id, now(), outcome, id);
  } else {
    // ดำเนินการได้หลังยืนยันตัวผู้ขอแล้วเท่านั้น
    if (r.status !== "verified") return;
    if (r.kind === "revoke") outcome = `revoke:${applyRevoke(r.consent_id)}${note ? ` · ${note}` : ""}`;
    if (r.kind === "level" && r.new_level) {
      const lv = applyLevel(r.consent_id, r.new_level);
      outcome = lv ? `level:${r.new_level}:${lv.indexed}${note ? ` · ${note}` : ""}` : note;
    }
    run("UPDATE consent_requests SET status = 'done', done_by = ?, done_at = ?, outcome = ? WHERE id = ?", user.id, now(), outcome, id);
  }
  closeTasks(`creq:${id}`);
  audit(user.id, `consent.request.${decision === "reject" ? "reject" : "done"}`, `creq:${id}`, outcome);
  revalidatePath("/consent/requests");
  revalidatePath("/consent");
  revalidatePath("/work");
}

// ---------- ค่าตอบแทนผู้ให้ข้อมูล ----------

export async function addPayment(formData: FormData) {
  const user = await requireRole(...ROLES);
  const personId = Number(formData.get("personId"));
  const amount = Number(formData.get("amount"));
  if (!personId || !(amount > 0)) redirect("/consent/payments?error=missing");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const id = run(
    "INSERT INTO payments (person_id, session_id, amount, purpose, method, paid_on, receipt_ref, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    personId,
    Number(formData.get("sessionId")) || null,
    amount,
    str("purpose"),
    str("method"),
    str("paidOn") || now().slice(0, 10),
    str("receipt"),
    user.id,
    now(),
  ).id;
  audit(user.id, "payment.add", `payment:${id}`, `${amount} THB person:${personId}`);
  revalidatePath("/consent/payments");
}
