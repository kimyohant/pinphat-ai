// การเปลี่ยนแปลงความยินยอมที่มีผลกับดัชนี AI ใช้ร่วมกันทั้งหน้าทะเบียนและหน้าคำขอจากชุมชน
import { now, one, run } from "./db";
import { reindexConsent } from "./kb";

/** ถอนความยินยอม: ลบชิ้นความรู้ทั้งหมดของความยินยอมนี้ออกจากดัชนี AI ทันที คืนจำนวนที่ลบ */
export function applyRevoke(consentId: number): number {
  run("UPDATE consents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", now(), consentId);
  return run("DELETE FROM kb_chunks WHERE consent_id = ?", consentId).changes;
}

/** เปลี่ยนระดับการเข้าถึงแล้วสร้างดัชนีใหม่ทั้งชุด (ระดับ 5 จะไม่ถูกนำเข้า) คืนจำนวนชิ้นที่สร้างใหม่ หรือ null ถ้าเปลี่ยนไม่ได้ */
export function applyLevel(consentId: number, level: number): { from: number; indexed: number } | null {
  const c = one<{ access_level: number; revoked_at: string | null }>("SELECT access_level, revoked_at FROM consents WHERE id = ?", consentId);
  if (!c || c.revoked_at || !(level >= 1 && level <= 5) || level === c.access_level) return null;
  run("UPDATE consents SET access_level = ? WHERE id = ?", level, consentId);
  return { from: c.access_level, indexed: reindexConsent(consentId) };
}
