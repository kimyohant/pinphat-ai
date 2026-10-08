import type { Dict } from "@/lib/i18n";
import type { Role } from "@/lib/access";
import { DeskTabs } from "@/components/desk/DeskHead";

/** แท็บของผู้ดูแลระบบ ผู้เชี่ยวชาญเห็นเฉพาะภาพรวมและทะเบียนคำศัพท์ */
export function AdminTabs({ t, active, role }: { t: Dict; active: "overview" | "users" | "vocab" | "audit"; role: Role }) {
  const tabs = [
    { key: "overview", href: "/admin", label: t.admin.tabOverview, icon: "admin" as const, admin: false },
    { key: "users", href: "/admin/users", label: t.admin.tabUsers, icon: "users" as const, admin: true },
    { key: "vocab", href: "/admin/vocab", label: t.admin.tabVocab, icon: "archive" as const, admin: false },
    { key: "audit", href: "/admin/audit", label: t.admin.tabAudit, icon: "log" as const, admin: true },
  ].filter((x) => !x.admin || role === "admin");
  return <DeskTabs tabs={tabs} active={active} label={t.admin.eyebrow} />;
}
