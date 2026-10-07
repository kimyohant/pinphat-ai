// อ่านภาษาและโหมดสีจากคุกกี้ฝั่ง server เพื่อให้หน้าแรกที่ส่งออกไปถูกต้องตั้งแต่ไบต์แรก ไม่กะพริบ
import { cookies, headers } from "next/headers";
import { DICTS, type Dict } from "./index";
import { DEFAULT_LOCALE, LOCALE_COOKIE, THEME_COOKIE, isLocale, isTheme, type Locale, type Theme } from "./config";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(v)) return v;
  // ครั้งแรกที่เข้า: เครื่องที่ตั้งภาษาลาวเห็นภาษาลาวทันที ที่เหลือเริ่มที่ภาษาไทย
  // ไม่เดาอังกฤษจากเบราว์เซอร์ เพราะเครื่องในโรงเรียนไทยจำนวนมากตั้งเป็นอังกฤษไว้ทั้งที่ผู้ใช้อ่านไทย
  const accept = (await headers()).get("accept-language")?.toLowerCase() ?? "";
  const first = accept.split(",")[0]?.trim().slice(0, 2);
  return first === "lo" ? "lo" : DEFAULT_LOCALE;
}

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
}

export async function getT(): Promise<{ t: Dict; locale: Locale }> {
  const locale = await getLocale();
  return { t: DICTS[locale], locale };
}
