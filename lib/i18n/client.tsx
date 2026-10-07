"use client";
import { createContext, useContext } from "react";
import { DICTS, type Dict } from "./index";
import { DEFAULT_LOCALE, type Locale } from "./config";

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

/** ส่งแค่รหัสภาษาลงมา แล้วเลือกพจนานุกรมในฝั่ง client เอง เพราะฟังก์ชันส่งข้าม server/client ไม่ได้ */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useT(): { t: Dict; locale: Locale } {
  const locale = useContext(Ctx);
  return { t: DICTS[locale], locale };
}
