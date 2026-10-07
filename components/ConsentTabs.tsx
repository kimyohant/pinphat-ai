import Link from "next/link";
import type { Dict } from "@/lib/i18n";

/** เมนูย่อยของงานชุมชนและความยินยอม: ทะเบียน · คำขอ · ค่าตอบแทน */
export function ConsentTabs({ t, active }: { t: Dict; active: "registry" | "requests" | "payments" }) {
  const tabs = [
    { key: "registry", href: "/consent", label: t.creq.tabRegistry },
    { key: "requests", href: "/consent/requests", label: t.creq.tabRequests },
    { key: "payments", href: "/consent/payments", label: t.creq.tabPayments },
  ] as const;
  return (
    <nav className="row" aria-label={t.creq.eyebrow}>
      {tabs.map((x) => (
        <Link key={x.key} href={x.href} className={`btn sm ${x.key === active ? "" : "ghost"}`} aria-current={x.key === active ? "page" : undefined}>
          {x.label}
        </Link>
      ))}
    </nav>
  );
}
