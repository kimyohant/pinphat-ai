import type { Dict } from "@/lib/i18n";
import { DeskTabs } from "@/components/desk/DeskHead";

/** แท็บของงานชุมชนและความยินยอม: ทะเบียน · คำขอ · ค่าตอบแทน */
export function ConsentTabs({ t, active, counts }: { t: Dict; active: "registry" | "requests" | "payments"; counts?: { requests?: number } }) {
  return (
    <DeskTabs
      label={t.creq.eyebrow}
      active={active}
      tabs={[
        { key: "registry", href: "/consent", label: t.creq.tabRegistry, icon: "consent" },
        { key: "requests", href: "/consent/requests", label: t.creq.tabRequests, icon: "users", count: counts?.requests },
        { key: "payments", href: "/consent/payments", label: t.creq.tabPayments, icon: "shield" },
      ]}
    />
  );
}
