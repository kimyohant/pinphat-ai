"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/access";

const LINKS: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/learn", label: "ฝึกเล่น" },
  { href: "/tutor", label: "ครูผู้ช่วย AI" },
  { href: "/archive", label: "คลังความรู้" },
  { href: "/teach", label: "ห้องเรียน", roles: ["teacher", "curator"] },
  { href: "/studio", label: "สตูดิโอสื่อ", roles: ["teacher", "collector", "curator"] },
  { href: "/field", label: "Field Studio", roles: ["collector", "curator"] },
  { href: "/curate", label: "ตรวจรับรอง", roles: ["curator"] },
  { href: "/consent", label: "ความยินยอม", roles: ["collector", "curator", "community"] },
];

export function NavLinks({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="เมนูหลัก">
      {LINKS.filter((l) => !l.roles || l.roles.includes(role)).map((l) => (
        <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "on" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
