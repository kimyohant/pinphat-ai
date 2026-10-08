import { getUser } from "@/lib/auth";
import { audit } from "@/lib/db";
import { kpis, ops } from "@/lib/admin";
import { DICTS } from "@/lib/i18n";

/** ตัวชี้วัด วช. เป็น CSV (UTF-8 พร้อม BOM ให้ Excel ภาษาไทยเปิดได้ถูกต้อง) */
export async function GET() {
  const user = await getUser();
  if (user.role !== "admin" && user.role !== "curator") return new Response("ไม่มีสิทธิ์", { status: 403 });
  const t = DICTS.th.admin as Record<string, string>;
  const asOf = new Date().toISOString();
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: (string | number)[][] = [["group", "indicator_key", "indicator", "value", "target", "progress", "as_of"]];
  for (const k of kpis()) rows.push([k.group, k.key, t[k.key], k.value, k.target, k.target ? (k.value / k.target).toFixed(3) : "", asOf]);
  const o = ops();
  for (const [key, label, v] of [
    ["oOpen", t.oOpen, o.open],
    ["oOverdue", t.oOverdue, o.overdue],
    ["oPending", t.oPending, o.pending],
    ["oGaps", t.oGaps, o.gaps],
    ["oRequests", t.oRequests, o.requests],
    ["oConsents", t.oConsents, o.consents],
    ["oRevoked", t.oRevoked, o.revoked],
    ["oEditRate", t.oEditRate, o.editRate == null ? "" : o.editRate.toFixed(3)],
  ] as const)
    rows.push(["operations", key, label, v, "", "", asOf]);
  audit(user.id, "admin.report.export", "kpi.csv");
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pinphat-kpi-${asOf.slice(0, 10)}.csv"` },
  });
}
