"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAME, THEME_COOKIE, type Locale, type Theme } from "@/lib/i18n/config";
import { Icon } from "@/components/ui/Icon";

const YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

function readTheme(): Theme {
  const v = document.documentElement.dataset.theme;
  return v === "light" || v === "dark" ? v : "system";
}

/** โหมดที่เห็นจริงตอนนี้ ใช้ตัดสินว่าปุ่มลัดควรพาไปกลางวันหรือกลางคืน */
function effective(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  writeCookie(THEME_COOKIE, theme);
  // แจ้งปุ่มอื่นในหน้าเดียวกันให้ตรงกัน เช่นปุ่มบนหัวมือถือกับในแผ่นเพิ่มเติม
  window.dispatchEvent(new CustomEvent("pp-theme", { detail: theme }));
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    setTheme(readTheme());
    const on = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("pp-theme", on);
    return () => window.removeEventListener("pp-theme", on);
  }, []);
  return [theme, applyTheme];
}

export function ThemeSegment() {
  const { t } = useT();
  const [theme, set] = useTheme();
  const opts: { v: Theme; label: string; icon: "device" | "sun" | "moon" }[] = [
    { v: "light", label: t.shell.themeLight, icon: "sun" },
    { v: "dark", label: t.shell.themeDark, icon: "moon" },
    { v: "system", label: t.shell.themeSystem, icon: "device" },
  ];
  return (
    <div className="seg" role="radiogroup" aria-label={t.shell.theme}>
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={theme === o.v} onClick={() => set(o.v)}>
          <Icon name={o.icon} size={16} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** ปุ่มเดียวบนหัวจอมือถือ: กดแล้วสลับกลางวันและกลางคืนทันที */
export function ThemeQuickToggle() {
  const { t } = useT();
  const [theme, set] = useTheme();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(effective(theme) === "dark"), [theme]);
  return (
    <button type="button" className="icon-btn" aria-label={t.shell.toggleTheme} title={t.shell.toggleTheme} onClick={() => set(dark ? "light" : "dark")}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

export function LangSegment() {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (l: Locale) => {
    if (l === locale) return;
    writeCookie(LOCALE_COOKIE, l);
    document.documentElement.lang = l;
    start(() => router.refresh());
  };
  return (
    <div className="seg" role="radiogroup" aria-label={t.shell.language} aria-busy={pending}>
      {LOCALES.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={locale === l} onClick={() => choose(l)} lang={l}>
          <span>{LOCALE_NAME[l]}</span>
        </button>
      ))}
    </div>
  );
}

/** ปุ่มภาษาแบบย่อบนหัวจอมือถือ: วนไทย ลาว อังกฤษ */
export function LangQuickToggle() {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
  return (
    <button
      type="button"
      className="icon-btn lang-btn"
      aria-label={`${t.shell.language}: ${LOCALE_NAME[locale]} → ${LOCALE_NAME[next]}`}
      aria-busy={pending}
      onClick={() => {
        writeCookie(LOCALE_COOKIE, next);
        document.documentElement.lang = next;
        start(() => router.refresh());
      }}
    >
      <Icon name="globe" size={18} />
      <span lang={locale}>{LOCALE_NAME[locale]}</span>
    </button>
  );
}
