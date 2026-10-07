// ภาษาและโหมดสีที่ระบบรองรับ (ใช้ได้ทั้งฝั่ง server และ client)

export const LOCALES = ["th", "lo", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "pp_lang";

/** ชื่อภาษาเขียนด้วยภาษานั้นเอง เพื่อให้คนที่อ่านภาษาอื่นไม่ออกยังหาภาษาของตัวเองเจอ */
export const LOCALE_NAME: Record<Locale, string> = { th: "ไทย", lo: "ລາວ", en: "English" };
export const LOCALE_SHORT: Record<Locale, string> = { th: "TH", lo: "LO", en: "EN" };
/** ใช้กับ Intl: วันที่ภาษาไทยเป็นพุทธศักราช ลาวและอังกฤษเป็นคริสต์ศักราช */
export const INTL_LOCALE: Record<Locale, string> = { th: "th-TH", lo: "lo-LA", en: "en-GB" };

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "pp_theme";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

/** แทนค่า {name} ในข้อความ: fmt("ส่งภายใน {date}", { date }) */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function fmtDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { day: "numeric", month: "short", year: "2-digit" });
}

export function fmtDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(INTL_LOCALE[locale], { dateStyle: "short", timeStyle: "short" });
}

/** ปีเกิดในฐานข้อมูลเป็น ค.ศ. แสดงเป็น พ.ศ. เฉพาะภาษาไทย */
export function fmtYear(ce: number, locale: Locale): number {
  return locale === "th" ? ce + 543 : ce;
}
