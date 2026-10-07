import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Noto_Sans_Lao, Noto_Serif_Lao, Sarabun, Trirong } from "next/font/google";
import { getUser } from "@/lib/auth";
import { DICTS } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale, getTheme } from "@/lib/i18n/server";
import { MobileHeader, Sidebar, TabBar } from "@/components/shell/Nav";
import { logout } from "./login/actions";
import "./design.css";

// Trirong กับ Sarabun มีทั้งอักษรไทยและละติน ลาวใช้ Noto ที่มีอักษรลาวครบ เบราว์เซอร์เลือกตามตัวอักษรเอง
const display = Trirong({ subsets: ["thai", "latin"], weight: ["500", "600", "700"], variable: "--f-display", display: "swap" });
const sans = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], variable: "--f-sans", display: "swap" });
const laoSans = Noto_Sans_Lao({ subsets: ["lao"], weight: ["400", "500", "600", "700"], variable: "--f-lao-sans", display: "swap", preload: false });
const laoSerif = Noto_Serif_Lao({ subsets: ["lao"], weight: ["500", "600", "700"], variable: "--f-lao-serif", display: "swap", preload: false });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono", display: "swap", preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const t = DICTS[await getLocale()];
  return { title: t.meta.title, description: t.meta.description };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1222" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale, theme] = await Promise.all([getUser(), getLocale(), getTheme()]);
  const t = DICTS[locale];
  const shellUser = { id: user.id, name: user.name, role: user.role };
  return (
    <html
      lang={locale}
      data-theme={theme === "system" ? undefined : theme}
      className={`${display.variable} ${sans.variable} ${laoSans.variable} ${laoSerif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <I18nProvider locale={locale}>
          <a className="skip" href="#main">
            {t.shell.skip}
          </a>
          <div className="app">
            <Sidebar user={shellUser} signOut={logout} />
            <div className="app-main">
              <MobileHeader />
              {children}
            </div>
          </div>
          <TabBar user={shellUser} signOut={logout} />
        </I18nProvider>
      </body>
    </html>
  );
}
