// ปลายทางทั้งหมดของระบบ ที่เดียว ใช้ทั้งแถบข้างบนจอใหญ่และแถบล่างบนมือถือ
import type { Role } from "./access";
import type { Dict } from "./i18n";

export type NavKey = "home" | "learn" | "tutor" | "archive" | "work" | "teach" | "studio" | "field" | "curate" | "consent";

export type NavItem = { key: NavKey; href: string; roles?: Role[]; group: "learn" | "work" };

export const NAV: NavItem[] = [
  { key: "home", href: "/", group: "learn" },
  { key: "learn", href: "/learn", group: "learn" },
  { key: "tutor", href: "/tutor", group: "learn" },
  { key: "archive", href: "/archive", group: "learn" },
  { key: "work", href: "/work", roles: ["collector", "assistant", "curator", "community"], group: "work" },
  { key: "teach", href: "/teach", roles: ["teacher", "curator"], group: "work" },
  { key: "studio", href: "/studio", roles: ["teacher", "collector", "curator"], group: "work" },
  { key: "field", href: "/field", roles: ["collector", "curator"], group: "work" },
  { key: "curate", href: "/curate", roles: ["curator"], group: "work" },
  { key: "consent", href: "/consent", roles: ["collector", "curator", "community"], group: "work" },
];

/**
 * แถบล่างบนมือถือมีได้ 4 ปลายทางบวกปุ่ม "เพิ่มเติม" เกินกว่านี้นิ้วโป้งกดพลาด
 * จึงเรียงตามงานหลักของแต่ละบทบาท ที่เหลือไปอยู่ในแผ่นเพิ่มเติม
 */
export const TABS_BY_ROLE: Record<Role, NavKey[]> = {
  public: ["home", "learn", "tutor", "archive"],
  student: ["home", "learn", "tutor", "archive"],
  teacher: ["home", "teach", "learn", "tutor"],
  collector: ["home", "work", "field", "consent"],
  assistant: ["home", "work", "archive", "tutor"],
  curator: ["home", "work", "curate", "field"],
  community: ["home", "work", "consent", "archive"],
};

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => !n.roles || n.roles.includes(role));
}

export function isActive(path: string, href: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function navLabel(t: Dict, key: NavKey, long = false): string {
  if (long && key === "tutor") return t.nav.tutorLong;
  if (long && key === "field") return t.nav.fieldLong;
  return t.nav[key];
}
