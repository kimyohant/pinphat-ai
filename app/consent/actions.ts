"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit, now, one, run } from "@/lib/db";
import { reindexConsent } from "@/lib/kb";

export async function changeLevel(formData: FormData) {
  const user = await requireRole("collector", "curator", "community");
  const id = Number(formData.get("consentId"));
  const level = Number(formData.get("level"));
  const c = one<{ access_level: number; revoked_at: string | null }>("SELECT access_level, revoked_at FROM consents WHERE id = ?", id);
  if (!c || c.revoked_at || !(level >= 1 && level <= 5) || level === c.access_level) return;
  run("UPDATE consents SET access_level = ? WHERE id = ?", level, id);
  // สร้างดัชนีใหม่ทั้งชุด: ระดับใหม่ติดไปกับทุกชิ้นความรู้ และระดับ 5 จะไม่ถูกนำเข้า
  const n = reindexConsent(id);
  audit(user.id, "consent.level", `consent:${id}`, `L${c.access_level} → L${level}, indexed ${n}`);
  revalidatePath("/consent");
}

export async function revokeConsent(formData: FormData) {
  const user = await requireRole("collector", "curator", "community");
  const id = Number(formData.get("consentId"));
  if (formData.get("confirm") !== "yes") return;
  run("UPDATE consents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", now(), id);
  const removed = run("DELETE FROM kb_chunks WHERE consent_id = ?", id).changes;
  audit(user.id, "consent.revoke", `consent:${id}`, `removed ${removed} chunks from AI index`);
  revalidatePath("/consent");
}
